#! /usr/bin/python

from basic_source import BasicSource
from perlin_source import PerlinSource
from fire_source import FireSource
from color_source import ColorSource
import time
import argparse
import sys
if sys.platform != 'linux':
    from tk_strips import TkPlot, TkStrip, DummyStrip
    # import yappi
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

    FRAME_TIME = 100       # desired time per frame in ms, fps = 1000/FRAME_TIME
    FPS_SAMPLES = 50      # over how many samples calculate FPS

    def __init__(self, source: BasicSource, output: str):
        self.output = output
        if self.output == "STRIP":
            # Create NeoPixel object with appropriate configuration.
            self.strip = PixelStrip(App.N_LEDS, App.LED_PIN, App.LED_FREQ_HZ, App.LED_DMA, App.LED_INVERT, App.LED_BRIGHTNESS, App.LED_CHANNEL)
        elif self.output == "LED":
            self.strip = TkStrip(App.N_LEDS, self)
        elif self.output == "PLOT":
            self.strip = TkPlot(App.N_LEDS, self)
        elif self.output == "DUMMY":
            self.strip = DummyStrip()
        else:
            print("Unknown output %s" % self.output)
            sys.exit(-1)

        self.source = source
        self.source.init(App.N_LEDS)
        self.frame = 0
        self.last_update = time.time_ns()
        self.fps_times = self.last_update
        # Intialize the library (must be called once before other functions).
        self.strip.begin()
        self.error_time = 0

    def update(self):
        current_ns = time.time_ns()
        delta_ms = (current_ns - self.last_update) / (10 ** 6)
        self.frame += 1
        if self.frame % App.FPS_SAMPLES == 0:
            fps = App.FPS_SAMPLES / (current_ns - self.fps_times) * (10 ** 9)
            self.fps_times = current_ns
            print("FPS: %s" % fps) #
            # if sys.platform != 'linux' and self.frame == 1000:
            #    yappi.get_func_stats().print_all()

        sleep_time = 1
        if delta_ms < App.FRAME_TIME:
            sleep_time = App.FRAME_TIME - delta_ms
        # expected_time = current_ns + sleep_time * 1000
        time.sleep(sleep_time / 1000)
        self.last_update = time.time_ns()
        self.source.update_leds(self.frame, self.strip)
        self.strip.show()
        #print(self.frame)

    def turn_off_strip(self):
        if self.output == 'STRIP':
            for i in range(App.N_LEDS):
                self.strip.setPixelColor(i, 0)
            self.strip.show()


if __name__ == '__main__':
    # Process arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-c', '--clear', action='store_true', help='clear the display on exit')
    parser.add_argument('-m', '--mode', choices=['EMBERS','PERLIN','COLOR'],
                        default="COLOR", help='output mode, can be either PERLIN or EMBERS')
    parser.add_argument('-o', '--output', choices=['STRIP', 'LED', 'PLOT', 'DUMMY'], default='LED',
                        help='Output device, on Windows, only LED and PLOT are valid')
    parser.add_argument('-t', '--timespeed', default=1, type=int,
                        help='Output device, on Windows, only LED and PLOT are valid')
    args = parser.parse_args()
    actual_output = 'STRIP'
    output_type = "LED"
    if sys.platform != 'linux':
        actual_output = args.output
        output_type = "HEX"
        if actual_output == "PLOT":
            output_type = "Y"
        # yappi.set_clock_type("cpu")
        # yappi.start()
    actual_source = BasicSource(args.timespeed, output_type)
    if args.mode == "PERLIN":
        actual_source = PerlinSource(args.timespeed, output_type)
    elif args.mode == "EMBERS":
        actual_source = FireSource(args.timespeed, output_type)
    elif args.mode == "COLOR":
        actual_source = ColorSource(args.timespeed, output_type, ["#FF0000", "#000000", "#000000"])
    app = App(actual_source, actual_output)
    if actual_output == 'STRIP' or actual_output == 'DUMMY':
        try:
            while True:
                app.update()
        except KeyboardInterrupt:
            app.turn_off_strip()

