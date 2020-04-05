#! /usr/bin/python

from random import random
from math import sin, cos, pi, exp
import colour
import time
from rpi_ws281x import PixelStrip, Color
import argparse



class Ember:
    def __init__(self, i, ember_data, age, ember_type):
        amp = ember_data["amp"] + random() * ember_data["amp_rand"]
        self.i = i
        self.x = (i - 1 + random()/3.0) * ember_data["x_space"]
        self.amp = amp
        self.osc_amp = amp * ember_data["osc_amp"]
        self.osc_freq = ember_data["osc_freq"] + random() * ember_data["osc_freq_rand"]
        self.osc_shift = random() * 2 * pi
        self.sigma = ember_data["sigma"] + random() * ember_data["sigma_rand"]
        self.decay = ember_data["decay"] + ember_data["decay_rand"] * random()
        self.age = age
        self.type = ember_type
        if ember_type == "big":
            print(self.x, self.amp)

    def get_contrib(self, x, t):
        osc = self.osc_amp * cos(self.osc_freq * t + self.osc_shift)
        return (self.amp + osc) * \
            exp(-0.5 * ((self.x - x) * self.amp / self.sigma / (self.amp + osc) )**2 - self.decay * (self.age - t)**2)

# LED strip configuration:
LED_COUNT = 150       # Number of LED pixels.
LED_PIN = 18          # GPIO pin connected to the pixels (18 uses PWM!).
# LED_PIN = 10        # GPIO pin connected to the pixels (10 uses SPI /dev/spidev0.0).
LED_FREQ_HZ = 800000  # LED signal frequency in hertz (usually 800khz)
LED_DMA = 10          # DMA channel to use for generating signal (try 10)
LED_BRIGHTNESS = 255  # Set to 0 for darkest and 255 for brightest
LED_INVERT = False    # True to invert the signal (when using NPN transistor level shift)
LED_CHANNEL = 0       # set to '1' for GPIOs 13, 19, 41, 45 or 53


class Application:
    N_LEDS = LED_COUNT
    NOISE = [5, 11, 23, 47]
    COL = {"EMBERS": [("#110000", 40), ("#BF2100", 50), ("#FFB20F", 51), ("#FFFFAF", )],
           "PERLIN": [("#0000AD", 101), ("#5040A0", )]}
    EMBERS = {  # x_space = N_LEDS / (count - 2)
        "big": {"count": 5, "amp": 0.6, "amp_rand": 0.1, "x_space": 50, "sigma": 15, "sigma_rand": 2,
                "osc_amp": 0.2, "osc_freq": 0.01, "osc_freq_rand": 0.01, "decay": 0.0, "decay_rand": 0},
        "small": {"count": 10, "amp": 0.15, "amp_rand": 0.01, "x_space": 150/8, "sigma": 5, "sigma_rand": 2,
                  "osc_amp": 0.2, "osc_freq": 0.02, "osc_freq_rand": 0.01, "decay": 0.0, "decay_rand": 0},
        "spark": {"count": 11, "amp": 0.1, "amp_rand": 0.2, "x_space": 15, "sigma": 3, "sigma_rand": 1,
                  "osc_amp": 0.2, "osc_freq": 0.01, "osc_freq_rand": 0.01,
                  "decay": 0.001, "decay_rand": 0.01}
    }

    def __init__(self, source):
        # Create NeoPixel object with appropriate configuration.
        self.strip = PixelStrip(LED_COUNT, LED_PIN, LED_FREQ_HZ, LED_DMA, LED_INVERT, LED_BRIGHTNESS, LED_CHANNEL)
        # Intialize the library (must be called once before other functions).
        self.strip.begin()
        self.source = source
        self.gradient = []
        led_colors = Application.COL[self.source]
        for i in range(len(led_colors) - 1):
            for c in colour.Color(led_colors[i][0]).range_to(colour.Color(led_colors[i+1][0]), led_colors[i][1]):
                self.gradient.append(c)

        if self.source == "PERLIN":
            self.noise = {}
            self.build_noise()
            self.noise_weight = [8/15, 4/15, 2/15, 1/15]
        else:
            self.embers = []
            self.build_embers()
        self.max_y = 0
        self.frame = 0
        self.update()

    def build_embers(self):
        for ember_type, ember_data in Application.EMBERS.items():
            for i in range(ember_data["count"]):
                self.embers.append(Ember(i, ember_data, 0, ember_type))

    def update_embers(self):
        for i, e in enumerate(self.embers):
            if e.type == "spark" and e.age < self.frame and e.decay * (e.age - self.frame) ** 2 > 10:  # self.decay * (self.age - t)**2
                # print("replacing ember")
                self.embers[i] = Ember(e.i + 0.2 * (random() - 0.5), Application.EMBERS["spark"],
                                       self.frame + 100 * random(), "spark")

    def build_noise(self):
        for freq in Application.NOISE:
            self.noise[freq] = []
            for i in range(freq):
                self.noise[freq].append((2 * random() - 1.0, 2 * random() * pi))  # amplitude, phase

    def sample_noise(self, noise, x, p):
        """
        Because the weights are -1..+1, the value in the middle of the interval is 0.5 at most, therefore
        the result is in range -0.5..+0.5
        """
        i = int(x)
        dx = x - i
        n0 = dx * noise[i][0] * cos(self.frame * p + noise[i][1])
        n1 = (dx - 1) * noise[i + 1][0] * cos(self.frame * p + noise[i + 1][1])
        w = dx * dx * (3 - 2 * dx)  # 3 dx^2 - 2 dx^3
        """
        2(a - b)x - (3a - 5b)x - 3bx + ax  https://eev.ee/blog/2016/05/29/perlin-noise/
        ax (1 - 3x^2 + 2x^3) + b(x - 1)(3x^2 - 2x^3)
        2ax^4-2bx^4 - 3ax^3 + 3bx^3 + 2bx^3 - 3bx^2 + ax   
        """
        n = n0 * (1 - w) + n1 * w
        # print("% 2.4f\t% 2.4f\t% 2.4f\t% 2.4f" % (x, n0, n1, n))
        return n + 0.5

    @staticmethod
    def bias(x, w):
        # return x ** (log(w) / log(2))
        return x / ((((1.0 / w) - 2.0) * (1.0 - x)) + 1.0)

    @staticmethod
    def gain(x, w):
        if x < 0.5:
            return Application.bias(x * 2.0, w) / 2.0
        else:
            return 1.0 - Application.bias(2.0 - x * 2.0, w) / 2.0

    def get_values_perlin(self):
        vals = []
        for i in range(Application.N_LEDS):
            y = 0
            for f in range(len(Application.NOISE)):
                freq = Application.NOISE[f]
                x = i * (freq - 2) / Application.N_LEDS + 0.5
                y += self.sample_noise(self.noise[freq], x, freq / 1000.0) * self.noise_weight[f]
            vals.append(Application.gain(y, 0.1))
        return vals

    def get_values_embers(self):
        vals = []
        for i in range(Application.N_LEDS):
            y = 0
            for e in self.embers:
                y += e.get_contrib(i, self.frame)
            if y > 1:
                y = 1.0
            vals.append(Application.gain(y, 0.25))
        return vals

    @staticmethod
    def float2int(c):
        FLOAT_ERROR = 0.0000005
        return int(c * 255 + 0.5 - FLOAT_ERROR)

    def update(self):
        self.frame += 1
        if self.source == "PERLIN":
            yvals = self.get_values_perlin()
        else:
            yvals = self.get_values_embers()
            self.update_embers()
        for y in yvals:
            if y > self.max_y:
                self.max_y = y
                # print(self.max_y)
        for i in range(Application.N_LEDS):
            color = self.gradient[int(100 * yvals[i])]
            val = (Application.float2int(color.red) << 16) | (Application.float2int(color.green) << 8) | Application.float2int(color.blue)
            self.strip.setPixelColor(i, val)
        self.strip.show()
        # print(self.frame)

if __name__ == '__main__':
    # Process arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-', '--clear', action='store_true', help='clear the display on exit')
    parser.add_argument('mode', nargs='?', default="EMBERS", help='output mode, can be either PERLIN or EMBERS')
    args = parser.parse_args()

    app = Application(args.mode)
    try:
        while True:
            app.update()
            time.sleep(20/1000)
    except KeyboardInterrupt:
        pass

