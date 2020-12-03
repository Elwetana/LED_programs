#!/usr/bin/python

from http.server import BaseHTTPRequestHandler, HTTPServer
import argparse
import logging
import json
import sys
import os
import zmq


logger = logging.getLogger(__name__)


class LEDHttpHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
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
        fname = "http%s" % self.path
        if os.path.exists(fname):
            f = open(fname, 'r')
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


class LEDHttpServer():

    if sys.platform != 'linux':
        serverIP = '192.168.88.21'
    else:
        serverIP = '192.168.88.78'
    serverPort = 80
    timeout = 0.1
    zmqPort = "tcp://*:5556"

    def __init__(self,args):
        if(args.ip != "default"):
            LEDHttpServer.serverIP = args.ip
        self.server = HTTPServer((LEDHttpServer.serverIP, LEDHttpServer.serverPort), LEDHttpHandler)
        self.server.timeout = LEDHttpServer.timeout
        logger.warning("HTTP server running")

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
        logger.warning("HTTP server terminating")

if __name__ == "__main__":
    print("HTTP server class")
    logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s: %(message)s',
                        filename='server.log', level=logging.INFO)
    parser = argparse.ArgumentParser(description='HTTP server for controlling LEDs')
    parser.add_argument("-i", "--ip", help='IP address', default="default", type=str)
    args = parser.parse_args()
    server = LEDHttpServer(args)
    server.start()
    while True:
        pass
