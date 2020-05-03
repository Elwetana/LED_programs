#! /usr/bin/python

from basic_source import BasicSource
from math import pi, cos
from random import random


class PerlinSource(BasicSource):
    NOISE = [5, 11, 23, 47]

    def __init__(self, ts, output_type):
        super().__init__(ts, output_type)
        self.noise = {}
        self.noise_weight = [8 / 15, 4 / 15, 2 / 15, 1 / 15]

    def init(self, n_led: int):
        super().init(n_led)
        self.build_noise()

    def get_colors(self):
        return [("#0000AD", 101), ("#5040A0",)]

    def build_noise(self):
        for freq in PerlinSource.NOISE:
            self.noise[freq] = []
            for i in range(freq):
                self.noise[freq].append((2 * random() - 1.0, 2 * random() * pi))  # amplitude, phase

    def sample_noise(self, freq, x, p, frame):
        """
        Because the weights are -1..+1, the value in the middle of the interval is 0.5 at most, therefore
        the result is in range -0.5..+0.5
        """
        noise = self.noise[freq]
        i = int(x)
        dx = x - i
        n0 = dx * noise[i][0] * cos(frame * p + noise[i][1])
        n1 = (dx - 1) * noise[i + 1][0] * cos(frame * p + noise[i + 1][1])
        w = dx * dx * (3 - 2 * dx)  # 3 dx^2 - 2 dx^3
        """
        2(a - b)x - (3a - 5b)x - 3bx + ax  https://eev.ee/blog/2016/05/29/perlin-noise/
        ax (1 - 3x^2 + 2x^3) + b(x - 1)(3x^2 - 2x^3)
        2ax^4-2bx^4 - 3ax^3 + 3bx^3 + 2bx^3 - 3bx^2 + ax
        """
        n = n0 * (1 - w) + n1 * w
        # print("% 2.4f\t% 2.4f\t% 2.4f\t% 2.4f" % (x, n0, n1, n))
        return n + 0.5

    def get_gradient_index(self, i, frame):
        y = 0
        for f in range(len(PerlinSource.NOISE)):
            freq = PerlinSource.NOISE[f]
            x = i * (freq - 2) / self.nLed + 0.5
            y += self.sample_noise(freq, x, freq / 1000.0, self.time_speed * frame) * self.noise_weight[f]
        return int(100* BasicSource.gain(y, 0.1))
