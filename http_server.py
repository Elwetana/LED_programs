#!/usr/bin/python

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


logger = logging.getLogger(__name__)


class LEDHttpHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        if len(self.path) > 3 and self.path[-2:] == 'js':
            self.send_header("Content-Type", "text/javascript; charset=UTF-8")
        elif len(self.path) > 4 and self.path[-3:] == 'svg':
            self.send_header("Content-Type", "image/svg+xml")
        else:
            self.send_header("Content-Type", "text/html; charset=UTF-8")
        self.end_headers()
        if self.path == "/favicon.ico":
            f = open("http/favicon.ico", 'rb')
            self.wfile.write(f.read())
            return
        if self.path == "/":
            f = open('http/index.html', 'r', encoding="utf-8")
            s = f.read()
            if sys.platform == "linux":
                systeminfo = LEDHttpHandler.get_sys_info()
                # print(systeminfo)
                s = s.replace("{{systeminfo}}", systeminfo)
            s = s.replace("{{state}}", json.dumps(self.server.state))
            self.wfile.write(s.encode())
            return
        if self.path[0:7] == "/source":
            payload = (self.path[len("/source/"):]).upper()
            msg = "LED SOURCE %s" % payload
            self.server.broadcaster.send_string(msg)
            logger.info("ZMQ message sent: %s" % msg)
            self.wfile.write('{"result":"ok"}'.encode())
            l = payload.split("?")
            self.server.state["source"] = l[0].lower()
            if len(l) > 1:
                self.server.state["color"] = "#" + l[1]
            return
        if self.path[0:4] == "/msg":
            payload = self.path[len("/msg/"):]
            msg = "LED MSG %s" % payload
            self.server.broadcaster.send_string(msg)
            logger.info("ZMQ message sent: %s" % msg)
            self.wfile.write('{"result":"ok"}'.encode())
            if payload[0:5] == "mode?":
                self.server.state["mode"] = payload[5:]
            return
        if self.path[0:7] == "/config":
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
            return
        fname = "http%s" % self.path
        if os.path.exists(fname):
            f = open(fname, 'r', encoding="utf-8")
            self.wfile.write(f.read().encode())
        else:
            self.wfile.write("FILE NOT FOUND".encode())
            logger.warning("File not found: %s" % fname)

    @staticmethod
    def get_sys_info():
        fproc = open("/proc/loadavg")
        proc = fproc.readline().split(" ")
        proc_info = "<tr><td>CPU Load:</td>"
        proc_info += "<td>" + "</td><td>".join(proc[0:3]) + "</td></tr>\n"
        ftemp = open("/sys/class/thermal/thermal_zone0/temp")
        temp_info = "<tr><td colspan=4>CPU temperature: %s°C</td></tr>\n" % (int(ftemp.readline()) / 1000)
        return "<table>\n" + proc_info + temp_info + "</table>\n"

    def get_config(self):
        if not os.path.exists(self.server.config_path):
            return {"error": "config file not found"}
        d = {}
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
        d = {}
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


class LEDHttpServer():

    serverIP = ""
    serverPort = 80
    timeout = 0.1
    zmqPort = "tcp://*:5556"
    
    def get_IP_address(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.connect(('<broadcast>', 0))
        return s.getsockname()[0]


    def __init__(self,args):
        if(args.ip != "default"):
            LEDHttpServer.serverIP = args.ip
        else:
            LEDHttpServer.serverIP = self.get_IP_address()
        logger.info("Server address: %s" % LEDHttpServer.serverIP)
        self.server = ThreadingHTTPServer((LEDHttpServer.serverIP, LEDHttpServer.serverPort), LEDHttpHandler)
        self.server.timeout = LEDHttpServer.timeout
        self.server.config_path = args.config_path
        logger.warning("Threading HTTP server running")

    def start(self):
        context = zmq.Context()
        self.server.broadcaster = context.socket(zmq.PUB)
        self.server.broadcaster.bind(LEDHttpServer.zmqPort)
        self.server.state = {"source": "embers", "color": "#FFFFFF", "mode": ""}
        
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
    server.start()
    while True:
        pass
