#! /usr/bin/python

from basic_source import BasicSource
from random import random
from math import cos, pi, exp, fabs


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
        self.cos_table = []
        self.contrib_table = []
        t = 0
        while t * self.osc_freq < 2 * pi:
            self.cos_table.append(cos(t * self.osc_freq + self.osc_shift))
            contrib = []
            x = -6 * self.sigma
            while x < 6 * self.sigma:
                osc = self.osc_amp * self.cos_table[t]
                c = (self.amp + osc) * exp(-0.5 * ((x / self.sigma * self.amp / (self.amp + osc)) ** 2))
                contrib.append(c)
                x += 1
            self.contrib_table.append(contrib)
            t += 1


    def get_contrib(self, x, t):
        """
        c = A' * e^ 1/2 ((x - x0)/sig)^2
        :param x:
        :param t:
        :return:
        """
        cos_t = t % len(self.cos_table)
        dx = int(self.x - x + 6 * self.sigma)
        if self.decay == 0:
            return self.contrib_table[cos_t][dx]
        else:
            return self.contrib_table[cos_t][dx] * exp(-0.5 * self.decay * (self.age - t)**2)


class FireSource(BasicSource):

    EMBERS = {  # x_space = N_LEDS / (count - 2)
        "big": {"amp": 0.4, "amp_rand": 0.1, "x_space": 100, "sigma": 30, "sigma_rand": 2,
                "osc_amp": 0.2, "osc_freq": 0.005, "osc_freq_rand": 0.01, "decay": 0.0, "decay_rand": 0},
        "small": {"amp": 0.2, "amp_rand": 0.05, "x_space": 60, "sigma": 9, "sigma_rand": 2,
                  "osc_amp": 0.2, "osc_freq": 0.01, "osc_freq_rand": 0.005, "decay": 0.0, "decay_rand": 0},
        "spark": {"amp": 0.1, "amp_rand": 0.2, "x_space": 25, "sigma": 3, "sigma_rand": 1,
                  "osc_amp": 0.2, "osc_freq": 0.01, "osc_freq_rand": 0.01, "decay": 0.001, "decay_rand": 0.001}
    }

    def __init__(self, ts):
        super().__init__(ts)
        self.embers = []

    def init(self, n_led):
        super().init(n_led)
        self.build_embers()

    def get_colors(self):
        return [("#110000", 40), ("#BF2100", 50), ("#FFB20F", 51), ("#FFFFAF", )]

    def build_embers(self):
        for ember_type, ember_data in FireSource.EMBERS.items():
            x = -ember_data["x_space"] / 2
            i = 0
            while x < self.nLed + ember_data["x_space"] / 2:
                self.embers.append(Ember(i, ember_data, 0, ember_type))
                i += 1
                x += ember_data["x_space"]

    def update_embers(self, frame):
        for i, e in enumerate(self.embers):
            if e.type == "spark" and e.age < frame and e.decay * (e.age - frame) ** 2 > 10:
                # print("replacing ember")
                self.embers[i] = Ember(e.i + int(2 * random() - 1), FireSource.EMBERS["spark"],
                                       frame + 100 + 100 * random(), "spark")

    def get_values(self, frame):
        if frame % 4 == 0:
            self.update_embers(self.time_speed * frame)
        values = []
        for i in range(self.nLed):
            y = 0
            for e in self.embers:
                if fabs(i - e.x) < 6 * e.sigma:
                    y += e.get_contrib(i, self.time_speed * frame)
            if y > 1:
                y = 1.0
            values.append(BasicSource.gain(y, 0.25))
        return values
