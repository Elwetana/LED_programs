
from http.server import BaseHTTPRequestHandler, HTTPServer
from multiprocessing import Process, Queue, Pipe
import logging
import sys


logger = logging.getLogger(__name__)


class LEDHttpHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        print(self.path)

        self.server.msg_queue.put({"path": self.path, "value": 0})

        self.send_response(200)
        self.end_headers()
        if self.path == "/favicon.ico":
            f = open("http\\favicon.ico", 'rb')
            self.wfile.write(f.read())
            return
        f = open('d:\\temp\\smazat\\smazat.html', 'r', encoding="utf-8")
        self.wfile.write(f.read().encode())


class LEDHttpServer(Process):

    serverPort = 80
    timeout = 0.1

    def __init__(self, pipe, msg_queue):
        Process.__init__(self)
        self.pipe = pipe
        self.msg_queue = msg_queue
        self.server = None

    def run(self):
        self.server = HTTPServer(('localhost', LEDHttpServer.serverPort), LEDHttpHandler)
        self.server.timeout = LEDHttpServer.timeout
        self.server.msg_queue = self.msg_queue
        logger.warning("HTTP server running")
        try:
            while True:
                self.server.handle_request()
                if self.pipe.poll():
                    command = self.pipe.recv()
                    if command[0] == 'quit':
                        break
        except:
            print(sys.exc_info())
            logger.fatal(sys.exc_info())

        logger.warning("HTTP server terminating")


class A:
    def __init__(self, o):
        self.v = 15
        if o == 1:
            self.f = self.f1
        else:
            self.f = self.f2

    def f1(self):
        print(self.v)

    def f2(self):
        self.f1()
        print(2 * self.v)


class B(A):
    def f1(self):
        print("aaa")

if __name__ == "__main__":
    a = B(0)
    a.f()

    """
    print("HTTP server class")
    logging.basicConfig(level=logging.INFO)
    msg_queue = Queue()
    controller_end, my_end = Pipe()
    server = LEDHttpServer(my_end, msg_queue)
    server.start()
    while True:
        msg = msg_queue.get()
        print(msg)
    """