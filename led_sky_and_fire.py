#! /usr/bin/python

from basic_source import BasicSource
from perlin_source import PerlinSource
from fire_source import FireSource
from math import ceil,floor
import colour
import time
import argparse
import sys
if sys.platform != 'linux':
    from tkinter import *
    from tkinter.ttk import *
    import matplotlib
    from matplotlib.figure import Figure
    from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
    matplotlib.use("TkAgg")
else:
    from rpi_ws281x import PixelStrip


class App:
    # LED strip configuration:
    N_LEDS = 454          # Number of LED pixels.
    LED_PIN = 18          # GPIO pin connected to the pixels (18 uses PWM!).
    # LED_PIN = 10        # GPIO pin connected to the pixels (10 uses SPI /dev/spidev0.0).
    LED_FREQ_HZ = 800000  # LED signal frequency in hertz (usually 800khz)
    LED_DMA = 10          # DMA channel to use for generating signal (try 10)
    LED_BRIGHTNESS = 255  # Set to 0 for darkest and 255 for brightest
    LED_INVERT = False    # True to invert the signal (when using NPN transistor level shift)
    LED_CHANNEL = 0       # set to '1' for GPIOs 13, 19, 41, 45 or 53

    FRAME_TIME = 20       # desired time per frame in ms, fps = 1000/FRAME_TIME
    FPS_SAMPLES = 50      # over how many samples calculate FPS

    LED_WIDTH = 6
    LED_HEIGHT = 16
    LED_SPACE = 2
    LED_PER_ROW = 150

    def __init__(self, source: BasicSource, output: str):
        self.output = output
        if self.output == "STRIP":
            # Create NeoPixel object with appropriate configuration.
            self.strip = PixelStrip(App.N_LEDS, App.LED_PIN, App.LED_FREQ_HZ, App.LED_DMA, App.LED_INVERT, App.LED_BRIGHTNESS, App.LED_CHANNEL)
            # Intialize the library (must be called once before other functions).
            self.strip.begin()
        elif self.output == "LED":
            self.root = Tk()
            self.leds = []
            #max_w = App.N_LEDS * (App.LED_WIDTH + App.LED_SPACE)
            max_w = (App.LED_WIDTH + App.LED_SPACE) * App.LED_PER_ROW
            max_h = (App.LED_HEIGHT + App.LED_SPACE) * ceil(App.N_LEDS / App.LED_PER_ROW)
            self.w = Canvas(self.root, width=max_w, height=max_h)
            self.w.pack()
            for i in range(App.N_LEDS):
                x = (i % App.LED_PER_ROW) * (App.LED_WIDTH + App.LED_SPACE) + App.LED_SPACE // 2
                y = (i // App.LED_PER_ROW) * (App.LED_HEIGHT + App.LED_SPACE) + App.LED_SPACE // 2
                self.leds.append(self.w.create_rectangle(x, y, x + App.LED_WIDTH, y + App.LED_HEIGHT,
                                                         fill="white", width=0))
        elif self.output == "PLOT":
            self.root = Tk()
            self.figure = Figure(figsize=(10, 4), dpi=100)
            self.plot = self.figure.add_subplot(1, 1, 1)
            self.canvas = FigureCanvasTkAgg(self.figure, self.root)
            self.canvas.get_tk_widget().grid(row=0, column=0)
        else:
            print("Unknown output %s" % self.output)
            sys.exit(-1)
        if self.output == "LED" or self.output == "STRIP":
            self.gradient = []
            led_colors = source.get_colors()
            for i in range(len(led_colors) - 1):
                for c in colour.Color(led_colors[i][0]).range_to(colour.Color(led_colors[i + 1][0]), led_colors[i][1]):
                    self.gradient.append(c)
            print(self.gradient)
        self.source = source
        self.source.init(App.N_LEDS)
        self.max_y = 0
        self.frame = 0
        self.last_update = time.time_ns()
        self.fps = 0  # (dt1 + dt2 + dt3 ... dtn) / n
        self.fps_times = []
        self.update()
        if self.output != "STRIP":
            self.root.mainloop()

    @staticmethod
    def float2int(c):
        FLOAT_ERROR = 0.0000005
        return int(c * 255 + 0.5 - FLOAT_ERROR)

    def update(self):
        current_ns = time.time_ns()
        delta_ms = (current_ns - self.last_update) / (10 ** 6)
        self.last_update = current_ns
        self.frame += 1
        self.fps_times.append(current_ns)
        if self.frame > App.FPS_SAMPLES:
            del self.fps_times[0]
        if self.frame % App.FPS_SAMPLES == 0:
            fps = App.FPS_SAMPLES/ (current_ns - self.fps_times[0]) * (10 ** 9)
            print("FPS: %s" % fps)

        sleep_time = 1
        if delta_ms < App.FRAME_TIME:
            sleep_time = App.FRAME_TIME - delta_ms
        if self.output == "LED" or self.output == "PLOT":
            pass
        else:
            time.sleep(sleep_time / 1000)
        yvals = self.source.get_values(self.frame)
        #yvals = [0.2] * 500
        for y in yvals:
            if y > self.max_y:
                self.max_y = y
            # print(self.max_y)
        if self.output == "STRIP":
            for i in range(App.N_LEDS):
                color = self.gradient[int(100 * yvals[i])]
                val = (App.float2int(color.red) << 16) | (App.float2int(color.green) << 8) | App.float2int(color.blue)
                self.strip.setPixelColor(i, val)
            self.strip.show()
        elif self.output == "LED":
            for i in range(len(self.leds)):
                self.w.itemconfig(self.leds[i], fill=self.gradient[int(100 * yvals[i])].hex)
            self.root.after(int(sleep_time), self.update)
        elif self.output == "PLOT":
            xvals = range(App.N_LEDS)
            self.plot.clear()
            self.plot.scatter(xvals, yvals,[4] * App.N_LEDS, marker='s')
            self.plot.axis([0, App.N_LEDS, 0, 1])
            self.canvas.draw()
            self.root.after(int(sleep_time), self.update)
        else:
            pass
       # print(self.frame)

    def turn_off_strip(self):
        if self.output == 'STRIP':
            for i in range(App.N_LEDS):
                self.strip.setPixelColor(i, 0)
            self.strip.show()


if __name__ == '__main__':
    # Process arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-c', '--clear', action='store_true', help='clear the display on exit')
    parser.add_argument('-m', '--mode', choices=['EMBERS','PERLIN'],
                        default="EMBERS", help='output mode, can be either PERLIN or EMBERS')
    parser.add_argument('-o', '--output', choices=['STRIP', 'LED', 'PLOT'], default='LED',
                        help='Output device, on Windows, only LED and PLOT are valid')
    parser.add_argument('-t', '--timespeed', default=1, type=int,
                        help='Output device, on Windows, only LED and PLOT are valid')
    args = parser.parse_args()
    actual_output = 'STRIP'
    if sys.platform != 'linux':
        actual_output = args.output
    actual_source = BasicSource(args.timespeed)
    if args.mode == "PERLIN":
        actual_source = PerlinSource(args.timespeed)
    elif args.mode == "EMBERS":
        actual_source = FireSource(args.timespeed)

    app = App(actual_source, actual_output)
    if actual_output == 'STRIP':
        try:
            while True:
                app.update()
        except KeyboardInterrupt:
            app.turn_off_strip()

