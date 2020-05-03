#! /usr/bin/python

from basic_source import BasicSource
from math import pi, cos
from random import random
from typing import List


class ColorSource(BasicSource):
    def __init__(self, time_speed, output_type, colors: List[str]):
        super().__init__(time_speed, output_type)
        self.colors = colors

    def init(self, nLed: int):
        super().init(nLed)
        pass # custom init code

    def get_colors(self):
        #colors = [(cc, 1) for cc in self.colors]
        #return colors
        return [("#000000", 1), ("#FF0000", 1), ("#FF0000", 1)]

    def get_gradient_index(self, i, frame):
        y = 0
        x = frame % self.nLed
        if (i - x) ** 2 < 2:
            y = 1
        return y
