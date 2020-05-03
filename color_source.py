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
        return [("#FEFEFF", 10), ("#239eeb", 1), ("#239eeb", 1)]

    def get_gradient_index(self, i, frame):
        ni = i % 50
        y = 1
        x = 50 - frame % 50
        if ni >= x and ni < x + 10:
            y = 9 + (x - ni) 

            #print (x - i)

        return y

    

