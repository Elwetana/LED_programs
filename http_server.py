#!/usr/bin/python

from http.server import BaseHTTPRequestHandler, HTTPServer
import logging
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
            self.wfile.write(f.read().encode())
            return
        if self.path[0:7] == "/source":
            msg = "LED SOURCE %s" % (self.path[len("/source/"):]).upper()
            self.server.broadcaster.send_string(msg)
            logger.info("ZMQ message sent: %s" % msg)
            self.wfile.write('{"result":"ok"}'.encode())
            return
        fname = "http%s" % self.path
        if os.path.exists(fname):
            f = open(fname, 'r')
            self.wfile.write(f.read().encode())
        else:
            self.wfile.write("FILE NOT FOUND".encode())
            logger.warning("File not found: %s" % fname)


class LEDHttpServer():

    if sys.platform != 'linux':
        serverIP = 'localhost'
    else:
        serverIP = '192.168.88.78'
    serverPort = 80
    timeout = 0.1
    zmqPort = "tcp://*:5556"

    def __init__(self):
        self.server = HTTPServer((LEDHttpServer.serverIP, LEDHttpServer.serverPort), LEDHttpHandler)
        self.server.timeout = LEDHttpServer.timeout
        logger.warning("HTTP server running")

    def start(self):
        context = zmq.Context()
        self.server.broadcaster = context.socket(zmq.PUB)
        self.server.broadcaster.bind(LEDHttpServer.zmqPort)
        
        try:
            while True:
                self.server.handle_request()
        except:
            print(sys.exc_info())
            logger.fatal(sys.exc_info())
        logger.warning("HTTP server terminating")

if __name__ == "__main__":
    print("HTTP server class")
    logging.basicConfig(level=logging.INFO)
    server = LEDHttpServer()
    server.start()
    while True:
        pass
