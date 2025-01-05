#!/usr/bin/python3
import base64
import random
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import socket
import argparse
import logging
import json
import sys
import os
import os.path
import re
import zmq
from typing import Dict, List, Union, TypedDict

from PIL import Image as pillowImg
import numpy as np
from scipy.stats import entropy
from colorsys import hls_to_rgb

logger = logging.getLogger(__name__)
N_LEDS = 200
N_THUMB_SIZE = 16


class PolybiusSquare:
    def __init__(self, polybius, hsl_colours):
        """
        Initialize the Polybius square and precompute character coordinates.

        Args:
            polybius: List of lists representing the Polybius square.
        """
        self.polybius = polybius
        # Precompute the coordinates for each character in the Polybius square
        self.coordinate_map = {
            char: (row_index, col_index)
            for row_index, row in enumerate(polybius)
            for col_index, char in enumerate(row)
        }
        self.hsl_colours = hsl_colours

    def get_coordinates(self, text):
        """
        Find coordinates of characters in the Polybius square using the precomputed dictionary.

        Args:
            text: String to find the coordinates for.

        Returns:
            List of tuples where each tuple is the (row, column) of a character in the square.
        """
        # Normalize the text to uppercase
        text = text.upper()

        # Replace "CH" with a unique placeholder
        text = text.replace("CH", "X")

        # Lookup coordinates for each character in the text
        return [self.coordinate_map[char] for char in text if char in self.coordinate_map]

    def encode_to_colors(self, text, dim_factor, length):
        """
        Encode a string into a sequence of colors based on a Polybius square.

        Args:
            text: String to encode.
            dim_factor: Float (0 to 1) to dim the colors (0 = black, 1 = original colors).
            length: Integer total number of leds to return

        Returns:
            List of colors representing the encoded string with separators.
        """
        # Get coordinates for the input text
        coordinates = self.get_coordinates(text)

        # Create the dimmed color palette in RGB
        dimmed_colors = []
        for h, s, l in self.hsl_colours:
            dimmed_lightness = l * dim_factor
            r, g, b = hls_to_rgb(h, dimmed_lightness, s)
            dimmed_colors.append((int(r * 255), int(g * 255), int(b * 255)))

        # Dimmed white separator
        white_hsl = (0, 0, 1)  # White in HSL
        dimmed_white_l = 1 * dim_factor
        dimmed_white_rgb = tuple(int(c * 255) for c in hls_to_rgb(white_hsl[0], dimmed_white_l, white_hsl[1]))

        # Encode the coordinates into colors
        result = []
        for row, col in coordinates:
            result.append(dimmed_colors[row])  # Row color
            result.append(dimmed_colors[col])  # Column color
            result.append(dimmed_white_rgb)  # Separator

        # Remove the last separator
        if result and result[-1] == dimmed_white_rgb:
            result.pop()

        # Truncate or pad the result to match the length
        if len(result) > length:
            result = result[:length]
        elif len(result) < length:
            result.extend([dimmed_white_rgb] * (length - len(result)))

        # Flatten the RGB tuples into a byte array
        flat_result = [component for rgb in result for component in rgb]

        # Encode the byte array as Base64
        return base64.b64encode(bytes(flat_result)).decode('ascii')


class KeyFrameData:
    keyframe: str  # base64 encoded states
    frame_time: int
    beauty_score: float
    client: str

    def __init__(self, keyframe, frame_time, client):
        self.keyframe = keyframe
        self.frame_time = frame_time
        self.client = client
        self.evaluate_beauty()

    def update_keyframe(self, keyframe, client):
        self.keyframe = keyframe
        self.client = client
        self.evaluate_beauty()

    def evaluate_beauty(self, optimal_distance=0.1):
        np_hues: np.array
        np_saturations: np.array
        np_lightness: np.array

        def process_colors(colors):
            hues, saturations, lightness = [], [], []
            for r, g, b in colors:
                r, g, b = r / 255.0, g / 255.0, b / 255.0
                max_c, min_c = max(r, g, b), min(r, g, b)
                delta = max_c - min_c
                # Hue
                if delta == 0:
                    h = 0
                elif max_c == r:
                    h = (g - b) / delta % 6
                elif max_c == g:
                    h = (b - r) / delta + 2
                else:
                    h = (r - g) / delta + 4
                h /= 6
                # Saturation and Lightness
                l = (max_c + min_c) / 2
                s = delta / (1 - abs(2 * l - 1)) if delta != 0 else 0
                hues.append(h)
                saturations.append(s)
                lightness.append(l)
            return np.array(hues), np.array(saturations), np.array(lightness)

        def compute_proximity_score():
            hue_diffs = np.abs(np.diff(np_hues, append=np_hues[0]))
            hue_diffs = np.minimum(hue_diffs, 1 - hue_diffs)
            proximity_scores = 1 - ((hue_diffs - optimal_distance) ** 2) / (optimal_distance * (1 - optimal_distance))
            weights = np_saturations[:-1] * np_saturations[1:]
            if np.sum(weights) > 0:
                return np.sum(proximity_scores[:-1] * weights) / np.sum(weights)
            return 0

        def compute_diversity_score():
            hist, _ = np.histogram(np_hues, bins=10, range=(0, 1), density=True)
            return entropy(hist) / np.log(len(hist))

        def compute_lightness_score():
            std = np.std(np_lightness)
            return max(0.0, 1 - abs(std - 0.2) / 0.2)

        def compute_saturation_score():
            mean = np.mean(np_saturations)
            return max(0.0, 1 - abs(mean - 0.6) / 0.4)

        def compute_pattern_entropy():
            hist_hue, _ = np.histogram(np_hues, bins=10, range=(0, 1), density=True)
            hist_sat, _ = np.histogram(np_saturations, bins=10, range=(0, 1), density=True)
            hist_light, _ = np.histogram(np_lightness, bins=10, range=(0, 1), density=True)
            return (entropy(hist_hue) + entropy(hist_sat) + entropy(hist_light)) / (3 * np.log(10))

        def decode_base64_pattern():
            decoded_bytes = base64.b64decode(self.keyframe)
            if len(decoded_bytes) % 3 != 0:
                raise ValueError("The decoded bytes do not represent valid RGB values.")
            return [(decoded_bytes[i], decoded_bytes[i + 1], decoded_bytes[i + 2]) for i in range(0, len(decoded_bytes), 3)]

        np_hues, np_saturations, np_lightness = process_colors(decode_base64_pattern())
        proximity_score = compute_proximity_score()
        diversity_score = compute_diversity_score()
        lightness_score = compute_lightness_score()
        saturation_score = compute_saturation_score()
        pattern_entropy = compute_pattern_entropy()

        # print("prox %s, divers %s, light %s, satur %s, entropy %s" % (proximity_score, diversity_score, lightness_score, saturation_score, pattern_entropy))

        self.beauty_score = max(0, min(1, (
                                            0.4 * proximity_score +
                                            0.2 * diversity_score +
                                            0.2 * lightness_score +
                                            0.1 * saturation_score +
                                            0.1 * pattern_entropy
                                )))


class KeyFrameState:
    kf_data: List[KeyFrameData]
    last_client: str
    client_times: Dict[str, datetime]
    last_beauty: float

    def __init__(self):
        self.kf_data = []
        self.last_client = ""
        self.client_times = {}
        self.last_beauty = 0.0

    def add_keyframe(self, keyframe, client):
        self.kf_data.append(KeyFrameData(keyframe=keyframe, frame_time=100, client=client))
        self.update_clients(client)
        return True

    def update_keyframe(self, position, keyframe, client):
        if not (position < len(self.kf_data)):
            return False
        self.kf_data[position].update_keyframe(keyframe=keyframe, client=client)
        self.update_clients(client)
        return True

    def update_time(self, position, time, client):
        if not (position < len(self.kf_data)):
            return False
        self.kf_data[position].frame_time = time
        self.update_clients(client)
        return True

    def delete_keyframe(self, position, client):
        if not (position < len(self.kf_data)):
            return False
        del self.kf_data[position]
        self.update_clients(client)
        return True

    def swap_keyframes(self, position_from, position_to, client):
        if not (position_from < len(self.kf_data)):
            return False
        if not (position_to < len(self.kf_data)):
            return False
        self.kf_data[position_to], self.kf_data[position_from] = self.kf_data[position_from], self.kf_data[position_to]
        self.update_clients(client)
        return True

    def update_clients(self, client):
        self.last_client = client
        self.client_times[client] = datetime.now()
        cutoff_time = datetime.now() - timedelta(hours=1)
        self.client_times = {client: time for client, time in self.client_times.items() if time >= cutoff_time}

    def load_from_json(self, save_data, client):
        self.kf_data = []
        for i in range(len(save_data["keyframes"])):
            self.kf_data.append(KeyFrameData(keyframe=save_data["keyframes"][i],
                                             frame_time=save_data["frame_times"][i],
                                             client=client))
        self.update_clients(client)

    def save_to_json(self, client):
        return {
            "keyframes": [d.keyframe for d in self.kf_data],
            "frame_times": [d.frame_time for d in self.kf_data]
        }

    def get_total_time(self):
        return sum([d.frame_time for d in self.kf_data])

    def get_total_beauty(self) -> tuple[float, float, int]:
        total_score = 0.0
        for kf in self.kf_data:
            # print(kf.beauty_score, kf.keyframe, kf.client)
            total_score += kf.beauty_score
        # result is average beauty multiplied by the number of clients (so adding new client has great impact)
        res = (self.last_beauty, 0 if len(self.kf_data) == 0 else (total_score / len(self.kf_data)), len(self.client_times))
        self.last_beauty = res[1]
        return res


class SaveInfo(TypedDict):
    saves: Dict[str, str]
    folders: List[str]
    result: str


class LEDHttpServerClass(ThreadingHTTPServer):
    broadcaster: zmq.Socket
    config_path: str
    state: Dict[str, str]
    paint_state: Dict[str, bytearray]
    kf_state: KeyFrameState
    polybiusSquare: PolybiusSquare


class LEDHttpHandler(BaseHTTPRequestHandler):

    server: LEDHttpServerClass
    save_names = {"Sunshine": "nature", "Mountain": "nature", "Ocean": "nature", "Butterfly": "nature", "Rainbow": "nature", "Garden": "nature", "Stream": "nature", "Bird": "nature", "Breeze": "nature", "Orchard": "nature", "Star": "nature", "Meadow": "nature", "Forest": "nature", "Beach": "nature", "Valley": "nature", "Flower": "nature", "Hill": "nature", "Glacier": "nature", "Waterfall": "nature", "River": "nature", "Balloon": "object", "Sunrise": "nature", "Sunset": "nature", "Fountain": "object", "Park": "nature", "Raindrop": "nature", "Rainforest": "nature", "Puppy": "animal", "Kitten": "animal", "Book": "object", "Bridge": "object", "Fireplace": "object", "Lighthouse": "object", "Sandbox": "object", "VanGogh": "painter", "Rembrandt": "painter", "DaVinci": "painter", "Michelangelo": "painter", "Picasso": "painter", "Monet": "painter", "Dali": "painter", "Cezanne": "painter", "Raphael": "painter", "Titian": "painter", "Caravaggio": "painter", "Vermeer": "painter", "Hokusai": "painter", "Goya": "painter", "Turner": "painter", "Constable": "painter", "Rodin": "painter", "Klimt": "painter", "Manet": "painter", "Matisse": "painter", "Renoir": "painter", "Degas": "painter", "Botticelli": "painter", "Bruegel": "painter", "ElGreco": "painter", "Gauguin": "painter", "Magritte": "painter", "Pillow": "object", "Cushion": "object", "Blanket": "object", "Quilt": "object", "Mug": "object", "Sweater": "object", "Scarf": "object", "Firework": "object", "Lantern": "object", "Candle": "object", "Gift": "object", "Snowflake": "nature", "Reindeer": "animal", "Sleigh": "object", "Ornament": "object", "Mistletoe": "nature", "Gingerbread": "food", "Chocolate": "food", "Eggnog": "food", "Bell": "object", "Carols": "music", "Snowman": "nature", "Ice": "nature", "Ski": "object", "Snowboard": "object", "Pinecone": "nature", "Holly": "nature", "Tinsel": "object", "Cherry": "fruit", "Strawberry": "fruit", "Apple": "fruit", "Pear": "fruit", "Peach": "fruit", "Banana": "fruit", "Blueberry": "fruit", "Raspberry": "fruit", "Blackberry": "fruit", "Pineapple": "fruit", "Coconut": "fruit", "Lemon": "fruit", "Orange": "fruit", "Melon": "fruit", "Apricot": "fruit", "Fig": "fruit", "Plum": "fruit", "Guitar": "music", "Piano": "music", "Violin": "music", "Flute": "music", "Saxophone": "music", "Trumpet": "music", "Lion": "animal", "Giraffe": "animal"}

    def split_arguments(self) -> Dict[str, Union[str, None]]:
        result: Dict[str, Union[str, None]] = {}
        parts = self.path.split("?")
        if len(parts) > 2:
            self.log_error("Invalid path %s" % self.path)
        result["base"] = parts[0]
        if len(parts) == 2:
            query_parts = parts[1].split("&")
            for query in query_parts:
                query_argument = query.split("=")
                if len(query_argument) > 2:
                    self.log_error("Invalid URL argument: %s" % query)
                if len(query_argument) == 2:
                    result[query_argument[0]] = query_argument[1]
                else:
                    result[query_argument[0]] = None
        return result

    def serve_index(self):
        f = open('http/index.html', 'r', encoding="utf-8")
        s = f.read()
        if sys.platform == "linux":
            systeminfo = LEDHttpHandler.get_sys_info()
            # print(systeminfo)
            s = s.replace("{{systeminfo}}", systeminfo)
        s = s.replace("{{state}}", json.dumps(self.server.state))
        self.wfile.write(s.encode())

    def change_source(self):
        payload = (self.path[len("/source/"):]).upper()
        msg = "LED SOURCE %s" % payload
        self.server.broadcaster.send_string(msg)
        logger.info("ZMQ message sent: %s" % msg)
        self.wfile.write('{"result":"ok"}'.encode())
        source_args = payload.split("?")
        self.server.state["source"] = source_args[0].lower()
        if len(source_args) > 1:
            self.server.state["color"] = "#" + source_args[1]
        if payload == "PAINT":
            self.server.kf_state.__init__()

    def send_message(self):
        payload = self.path[len("/msg/"):]
        msg = "LED MSG %s" % payload
        self.server.broadcaster.send_string(msg)
        logger.info("ZMQ message sent: %s" % msg)
        self.wfile.write('{"result":"ok"}'.encode())
        if payload[0:5] == "mode?":
            self.server.state["mode"] = payload[5:]

    def serve_paint(self):
        """
        If parameter state was specified, we will do diff with the last state from the same client
        and update the "leds" state with the diff.
        In any case, we will send back the current state of leds
        :return:
        """
        if self.server.state["source"] != "paint":
            self.wfile.write(json.dumps({"result": "error", "error": "Not in the paint mode"}).encode())
            return
        qq = self.split_arguments()
        client = self.client_address[0]
        if client not in self.server.paint_state:
            self.server.paint_state[client] = bytearray(3 * N_LEDS)
        if "state" in qq:
            state: bytes = base64.b64decode(qq["state"])
            for led in range(N_LEDS):
                if state[3 * led + 0] != self.server.paint_state[client][3 * led + 0] or \
                   state[3 * led + 1] != self.server.paint_state[client][3 * led + 1] or \
                   state[3 * led + 2] != self.server.paint_state[client][3 * led + 2]:
                    self.server.paint_state["leds"][3 * led + 0] = state[3 * led + 0]
                    self.server.paint_state["leds"][3 * led + 1] = state[3 * led + 1]
                    self.server.paint_state["leds"][3 * led + 2] = state[3 * led + 2]
        self.server.paint_state[client] = bytearray(self.server.paint_state["leds"])
        base64_state = base64.b64encode(self.server.paint_state["leds"]).decode(encoding="utf-8")
        msg = "LED MSG set?%s" % base64_state
        self.server.broadcaster.send_string(msg)
        logger.info("ZMQ message sent: %s" % msg)
        self.wfile.write(json.dumps({"result": "ok", "state": base64_state}).encode())

    def keyframes_process_command(self, qq: Dict[str, str]) -> str:
        """
        kf?command=add&state=<base64 encoded RGB values>
        kf?command=del&position=<int position in linked list>
        kf?command=update&position=<pos>&state=<base 64 encoded>
        kf?command=time&position=<pos>&time=<int timing>
        kf?command=swap&from=<pos1>&to=<pos2>
        kf?command=get

        :return: message to send to server
        """

        client = self.client_address[0]
        if qq["command"] == "add":
            self.server.kf_state.add_keyframe(keyframe=qq["state"], client=client)
            return "LED MSG add?%s" % qq["state"]

        # for all commands but add, client needs to be updated first if the kf data were modified
        if self.server.kf_state.last_client != client:
            self.server.kf_state.update_clients(client)
            return ""

        if qq["command"] == "del":
            position = int(qq["position"])
            if self.server.kf_state.delete_keyframe(position=position, client=client):
                return "LED MSG del?%s" % position
        elif qq["command"] == "update":
            position = int(qq["position"])
            if self.server.kf_state.update_keyframe(position=position, keyframe=qq["state"], client=client):
                return "LED MSG update?%s&%s" % (position, qq["state"])
        elif qq["command"] == "time":
            position = int(qq["position"])
            timing = int(qq["time"])
            if self.server.kf_state.update_time(position=position, time=timing, client=client):
                return "LED MSG time?%s&%s" % (position, timing)
        elif qq["command"] == "swap":
            from_position = int(qq["from"])
            to_position = int(qq["to"])
            if self.server.kf_state.swap_keyframes(position_from=from_position, position_to=to_position, client=client):
                return "LED MSG swap?%s&%s" % (from_position, to_position)
        elif qq["command"] == "get":
            self.server.kf_state.update_clients(client=client)
            return ""
        else:
            logger.error("Unknown command for keyframes %s" % qq["command"])
            return ""
        logger.error("Invalid parameter for command %s" % qq["command"])
        return ""

    def save_keyframes(self, qq: Dict) -> bool:
        """
        Save current keyframes if the client is up-to-date
        :param qq: parsed query parameters
        :return: True if the last update was from the same client, False otherwise
        """
        if self.server.kf_state.last_client != self.client_address[0]:
            return False
        save_folder = "saves/%s" % qq["folder"]
        if not os.path.exists(save_folder) or not os.path.isdir(save_folder):
            if os.path.exists(save_folder) and not os.path.isdir(save_folder):
                os.remove(save_folder)
            os.mkdir(save_folder)
        # save name = "<frame count>fr_<total time>s_<random save name>
        save_name = "%sfr_%ss-%s" % (len(self.server.kf_state.kf_data),
                                     round(self.server.kf_state.get_total_time() / 1000, 0),
                                     random.choice(list(LEDHttpHandler.save_names.keys())))
        save_data = self.server.kf_state.save_to_json(client=self.client_address[0])
        with open(os.path.join(save_folder, save_name + ".json"), "w") as f:
            json.dump(save_data, f)
        self.list_keyframe_saves(qq)
        return True

    def load_keyframes(self, qq):
        save_folder = "saves/%s" % qq["folder"]
        save_name = qq["file"]
        path = os.path.join("saves/%s" % qq["folder"], qq["file"] + ".json")
        if not os.path.exists(path):
            return False
        n_old_frames = len(self.server.kf_state.kf_data)
        with open(os.path.join(save_folder, save_name + ".json"), "r") as f:
            save_data = json.load(f)
            self.server.kf_state.load_from_json(save_data, self.client_address[0])
        for i in range(n_old_frames):
            self.server.broadcaster.send_string("LED MSG del?0")
        i = 0
        for data in self.server.kf_state.kf_data:
            self.server.broadcaster.send_string("LED MSG add?%s" % data.keyframe)
            self.server.broadcaster.send_string("LED MSG time?%s&%s" % (i, data.frame_time))
            i += 1
        logger.info("Send %s + %i ZMQ messages" % (n_old_frames, 2 * i))
        return True

    def list_keyframe_saves(self, qq):
        save_folder = "saves/%s" % qq["folder"]
        saves = []
        if os.path.exists(save_folder) and os.path.isdir(save_folder):
            all_stuff = os.listdir(save_folder)
            for stuff in all_stuff:
                file_name = os.path.join(save_folder, stuff)
                if os.path.isfile(file_name):
                    name, ext = os.path.splitext(stuff)
                    if ext == ".json":
                        saves.append(name)
        self.wfile.write(json.dumps({"result": "ok", "names": saves}).encode())

    def check_secret(self):
        message = "hledetevpokojikteryjezdrojemvsehotepla"
        beauty_threshold = 1.0
        last_beauty, beauty, n_clients = self.server.kf_state.get_total_beauty()
        if beauty * n_clients > beauty_threshold:
            dimness = min(1.0, beauty * n_clients - beauty_threshold)
            msg_state = self.server.polybiusSquare.encode_to_colors(message, dimness, N_LEDS)
            msg = "LED MSG sct?%s" % msg_state
            self.server.broadcaster.send_string(msg)
            logger.info("ZMQ message sent: %s" % msg)
            msg = "LED MSG stt?%s" % (n_clients * 1000)
            self.server.broadcaster.send_string(msg)
            logger.info("ZMQ message sent: %s" % msg)
            # print("*** ADDING SECRET %s ***" % dimness)
        elif last_beauty > beauty_threshold > beauty:
            msg = "LED MSG tcs?0"
            self.server.broadcaster.send_string(msg)
            logger.info("ZMQ message sent: %s" % msg)
            # print("*** REMOVING SECRET ***")
        else:
            # print("secret unchanged, beauty %s, prev beauty %s" % (beauty, last_beauty))
            pass

    def serve_keyframes(self):
        if self.server.state["source"] != "paint":
            self.wfile.write(json.dumps({"result": "error", "error": "Not in the paint mode"}).encode())
            return
        qq = self.split_arguments()
        if "command" not in qq:
            logger.error("Invalid keyframe message %s" % self.path)
            self.wfile.write(json.dumps({"result": "error", "error": "Invalid request"}).encode())
            return
        if qq["command"] == "save":
            if self.save_keyframes(qq):
                return
        elif qq["command"] == "load":
            self.load_keyframes(qq)  # this overwrites self.server.kf_state, which is then returned at the end of this function
        elif qq["command"] == "list":
            self.list_keyframe_saves(qq)
            return
        else:
            msg = self.keyframes_process_command(qq)
            if msg != "":
                self.server.broadcaster.send_string(msg)
                logger.info("ZMQ message sent: %s" % msg)
                self.check_secret()
        self.wfile.write(json.dumps({
            "result": "ok",
            "keyframes": [d.keyframe for d in self.server.kf_state.kf_data],
            "frame_times": [d.frame_time for d in self.server.kf_state.kf_data]
        }).encode())

    def serve_config(self):
        if "?" not in self.path:
            d = self.get_config()
            d["result"] = "ok"
            s = json.dumps(d)
            self.wfile.write(s.encode())
        else:
            d = self.save_config(self.path[8:])
            s = json.dumps(d)
            if "result" in d and d["result"] == "ok":
                self.server.broadcaster.send_string("LED RELOAD COLOR")
                logger.info("ZMQ message sent: LED RELOAD COLOR")
            self.wfile.write(s.encode())

    def serve_file(self, is_binary):
        file_name = "http%s" % self.path
        if os.path.exists(file_name):
            if is_binary:
                f = open(file_name, 'rb')
                self.wfile.write(f.read())
            else:
                f = open(file_name, 'r', encoding="utf-8")
                self.wfile.write(f.read().encode())
        else:
            self.wfile.write("FILE NOT FOUND".encode())
            logger.warning("File not found: %s" % file_name)

    def get_save_names(self, folder_name, n):
        """
        Tries to get n name candidates, excluding the names already used
        Tries to balance the names from different categories
        :param folder_name:
        :param n:
        :return:
        """
        names = LEDHttpHandler.save_names.copy()
        save_folder = "saves/%s" % folder_name
        if os.path.exists(save_folder) and os.path.isdir(save_folder):
            all_stuff = os.listdir(save_folder)
            for stuff in all_stuff:
                file_name = os.path.join(save_folder, stuff)
                if os.path.isfile(file_name):
                    name, ext = os.path.splitext(stuff)
                    if ext == ".png" and name in names:
                        del names[name]
        categories: Dict[str, List[str]] = {}
        for name, category in names.items():
            if category not in categories:
                categories[category] = []
            categories[category].append(name)
        while True:
            max_names = 0
            max_category = ""
            total = 0
            for category, cat_names in categories.items():
                total += len(cat_names)
                if len(cat_names) > max_names:
                    max_category = category
                    max_names = len(cat_names)
            if total <= n:
                break
            del categories[max_category][random.randrange(max_names)]
        result = []
        for x in categories.values():
            result.extend(x)
        self.wfile.write(json.dumps({"result": "ok", "names": result}).encode())

    def save_state(self, folder_name, save_name, state):
        save_folder = "saves/%s" % folder_name
        if not os.path.exists(save_folder) or not os.path.isdir(save_folder):
            if os.path.exists(save_folder) and not os.path.isdir(save_folder):
                os.remove(save_folder)
            os.mkdir(save_folder)
        LEDHttpHandler.save_state_as_png(state, os.path.join(save_folder, save_name + ".png"))
        self.wfile.write('{"result":"ok"}'.encode())

    def load_saves(self, folder_name: str):
        """
        Loads oll png files in folder_name. Writes to output list of saved files
        and their names and list of other folders in /saves directory
        :param folder_name:
        :return:
        """
        result: SaveInfo = {"saves": {}, "folders": [], "result": ""}
        save_folder = "saves/%s" % folder_name
        if os.path.exists(save_folder) and os.path.isdir(save_folder):
            all_stuff = os.listdir(save_folder)
            for stuff in all_stuff:
                file_name = os.path.join(save_folder, stuff)
                if os.path.isfile(file_name):
                    name, ext = os.path.splitext(file_name)
                    if ext == ".png":
                        base64_state = LEDHttpHandler.load_state_from_png(file_name)
                        result["saves"][name] = base64_state
        for stuff in os.listdir("saves/"):
            if os.path.isdir(os.path.join("saves/", stuff)):
                result["folders"].append(stuff)
        result["result"] = "ok"
        self.wfile.write(json.dumps(result).encode())

    def serve_save(self):
        """
        Valid inputs:
        ?get_names&folder=<folder> -> get save names for folder
        ?save_as&folder=<folder>&name=<name>&state=<base64encoded state>
        ?load&folder=<folder>
        :return:
        """
        qq = self.split_arguments()
        if "get_names" in qq and "folder" in qq and qq["folder"] != "":
            self.get_save_names(qq["folder"], 9)
        elif "save_as" in qq and "folder" in qq and "name" in qq and qq["folder"] != "" and qq["name"] != "":
            self.save_state(qq["folder"], qq["name"], qq["state"])
        elif "load" in qq and "folder" in qq and qq["folder"] != "":
            self.load_saves(qq["folder"])
        else:
            self.wfile.write(('{"result":"error", "reason":"Unknown save command or missing parameters %s"}' % self.path).encode())

    def do_GET(self):
        # Send headers
        self.send_response(200)
        is_binary = False
        if len(self.path) > 3 and self.path[-2:] == 'js':
            self.send_header("Content-Type", "text/javascript; charset=UTF-8")
        elif len(self.path) > 4 and self.path[-3:] == 'svg':
            self.send_header("Content-Type", "image/svg+xml")
        elif len(self.path) > 4 and self.path[-3:] == 'png':
            self.send_header("Content-Type", "image/png")
            is_binary = True
        else:
            self.send_header("Content-Type", "text/html; charset=UTF-8")
        self.end_headers()

        # Serve requests
        if self.path == "/favicon.ico":
            f = open("http/favicon.ico", 'rb')
            self.wfile.write(f.read())
        elif self.path == "/":
            self.serve_index()
        elif self.path[0:7] == "/source":
            self.change_source()
        elif self.path[0:4] == "/msg":
            self.send_message()
        elif self.path[0:7] == "/config":
            self.serve_config()
        elif self.path[0:5] == "/save":
            self.serve_save()
        elif self.path[0:6] == "/paint":
            self.serve_paint()
        elif self.path[0:3] == "/kf":
            self.serve_keyframes()
        else:
            self.serve_file(is_binary)

    @staticmethod
    def get_sys_info():
        fproc = open("/proc/loadavg")
        proc = fproc.readline().split(" ")
        proc_info = "<tr><td>CPU Load:</td>"
        proc_info += "<td>" + "</td><td>".join(proc[0:3]) + "</td></tr>\n"
        ftemp = open("/sys/class/thermal/thermal_zone0/temp")
        temp_info = "<tr><td colspan=4>CPU temperature: %s°C</td></tr>\n" % (int(ftemp.readline()) / 1000)
        return "<table>\n" + proc_info + temp_info + "</table>\n"

    @staticmethod
    def save_state_as_png(base64_state, file_name):
        state = base64.b64decode(base64_state)
        missing_bytes = (N_THUMB_SIZE * N_THUMB_SIZE - N_LEDS) * 3
        png = pillowImg.frombytes("RGB", (N_THUMB_SIZE, N_THUMB_SIZE), state + bytes(missing_bytes))
        png.save(file_name, "PNG")

    @staticmethod
    def load_state_from_png(file_name):
        png = pillowImg.open(file_name)
        state = png.tobytes()[0 : N_LEDS * 3]
        base64_state = base64.b64encode(state).decode('utf-8')
        return base64_state

    def get_config(self):
        if not os.path.exists(self.server.config_path):
            return {"error": "config file not found"}
        d: Dict[str, Dict[int, Dict[str, str]]] = {}
        with open(self.server.config_path, "r") as fc:
            ll = fc.readlines()
        i = 0
        while ll[i][0] == ";" or ll[i][0] == "#":  # skip comments in beginning of file
            i += 1
        while i < len(ll):
            name = ll[i][0:ll[i].index(" ")]
            i += 1
            if len(ll[i]) > 0 and ll[i][0] == "#":  # this is commented config line, we want to put it in dictionary
                d[name] = {}
                color_comments = ll[i][1:].strip().split('-')
                for cc in color_comments:
                    if ':' not in cc:
                        print("ERROR in comment %s." % cc)
                        continue
                    ii = cc.index(":")
                    n = int(cc[0:ii])
                    c = cc[cc.index(":") + 1:]
                    d[name][n] = {"comment": c}
                i += 1
                colors = re.split(" +", ll[i].strip())
                j = 0
                n = 0
                while True:
                    if n not in d[name]:
                        d[name][n] = {}
                    d[name][n]["color"] = colors[j]
                    if j == len(colors) - 1:
                        break
                    grad_len = int(colors[j + 1])
                    if grad_len == 0:
                        n += 1
                    elif grad_len == 1:
                        n += 1
                    elif j + 3 == len(colors):
                        n += grad_len - 1
                    elif int(colors[j + 3]) == 0:
                        n += grad_len - 1
                    else:
                        n += grad_len
                    j += 2
            elif len(ll[i]) > 0 and ll[i][0] == ";":  # this is commented config line, we want to skip
                i += 1
            i += 1
        return d

    def save_config(self, s):
        if not os.path.exists(self.server.config_path):
            return {"error": "config file not found"}
        aa = s[0:-1].split("&")
        d: Dict[str, Dict[int, str]] = {}
        for a in aa:
            name_n, col = a.split("=")
            name, n = name_n.split("__")
            if name not in d:
                d[name] = {}
            d[name][int(n)] = col

        # print(d)
        out_lines = []
        with open(self.server.config_path, "r") as fc:
            ll = fc.readlines()
        i = 0
        while ll[i][0] == ";" or ll[i][0] == "#":  # skip comments in beginning of file
            out_lines.append(ll[i])
            i += 1
        while i < len(ll):
            name = ll[i][0:ll[i].index(" ")]
            out_lines.append(ll[i])
            i += 1
            if len(ll[i]) > 0 and ll[i][0] == "#":  # we will update the next line
                if name not in d:
                    return {"error": "name %s not found in config" % name}
                out_lines.append(ll[i])
                i += 1

                # this is the line we shall update
                colors = re.split(" +", ll[i].strip())
                j = 0
                n = 0
                line = ""
                while True:
                    if n not in d[name]:
                        return {"error": "value for color %s not received in source %s" % (n, name)}
                    line += "0x" + d[name][n]
                    if j == len(colors) - 1:
                        break
                    grad_len = int(colors[j + 1])
                    line += " %s " % grad_len
                    if grad_len == 0:
                        n += 1
                    elif grad_len == 1:
                        n += 1
                    elif j + 3 == len(colors):
                        n += grad_len - 1
                    elif int(colors[j + 3]) == 0:
                        n += grad_len - 1
                    else:
                        n += grad_len
                    j += 2
                # print(line)
                out_lines.append(line + "\n")
                i += 1
            elif len(ll[i]) > 0 and ll[i][0] == ";":  # this is commented config line, we want to skip
                out_lines.append(ll[i])
                i += 1
                out_lines.append(ll[i])
                i += 1
            else:
                out_lines.append(ll[i])
                i += 1
        with open(self.server.config_path, "w") as fc2:
            fc2.writelines(out_lines)
        return {"result": "ok"}


class LEDHttpServer:

    serverIP = ""
    serverPort = 80
    timeout = 0.1
    zmqPort = "tcp://*:5556"

    def get_IP_address(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.connect(('<broadcast>', 0))
        return s.getsockname()[0]

    def __init__(self, args):
        if args.ip != "default":
            LEDHttpServer.serverIP = args.ip
        else:
            LEDHttpServer.serverIP = self.get_IP_address()
        logger.info("Server address: %s" % LEDHttpServer.serverIP)
        self.server = LEDHttpServerClass((LEDHttpServer.serverIP, LEDHttpServer.serverPort), LEDHttpHandler)
        self.server.timeout = LEDHttpServer.timeout
        self.server.config_path = args.config_path
        logger.warning("Threading HTTP server running")

    def start(self):
        context = zmq.Context()
        self.server.broadcaster = context.socket(zmq.PUB)
        self.server.broadcaster.bind(LEDHttpServer.zmqPort)
        self.server.state = {"source": "embers", "color": "#FFFFFF", "mode": ""}
        self.server.paint_state = {"leds": bytearray(3 * N_LEDS)}
        self.server.kf_state = KeyFrameState()
        self.server.polybiusSquare = PolybiusSquare([
            ['A', 'B', 'C', 'D', 'E'],
            ['F', 'G', 'H', 'X', 'I'],  # "Ch" replaced with "X"
            ['J', 'K', 'L', 'M', 'N'],
            ['O', 'P', 'R', 'S', 'T'],
            ['U', 'V', 'X', 'Y', 'Z']
        ], [
            (0.0, 1.0, 0.5),    # Red
            (0.043, 1.0, 0.5),  # Orange
            (0.111, 1.0, 0.5),  # Yellow
            (0.333, 1.0, 0.5),  # Green
            (0.667, 1.0, 0.5)   # Blue
        ])

        try:
            while True:
                self.server.handle_request()
        except:
            print(sys.exc_info())
            logger.fatal(sys.exc_info())
        logger.warning("Threading HTTP server terminating")


if __name__ == "__main__":
    print("HTTP server class")
    logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s: %(message)s',
                        filename='server.log', level=logging.INFO)
    parser = argparse.ArgumentParser(description='HTTP server for controlling LEDs')
    parser.add_argument("-i", "--ip", help='IP address', default="default", type=str)
    parser.add_argument("-c", "--config_path", help="Controller config path", default="d:\\code\\C++\\filter_test\\LED_controller\\config", type=str)
    args = parser.parse_args()
    server = LEDHttpServer(args)
    print("Serving on IP %s" % server.serverIP)
    server.start()
    while True:
        pass
