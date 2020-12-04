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
        self.heads = [19, 246, 0, 38, 76, 114, 152, 190, 227, 265, 303, 341, 379, 417]
        self.shift = [0] * len(self.heads)
        self.cur_heads = [0] * len(self.heads)

    def get_colors(self):
        #colors = [(cc, 1) for cc in self.colors]
        #return colors
        return [("#FEFEFF", 19), ("#239eeb", 1), ("#FFFEFE", 19), ("#FF0000", 1)]

    def update_leds(self, frame: int, strip):
        mframe = frame % self.nLed
        for i in range(len(self.heads)):
            #self.shift[i] += int(random() * 4 - 2)
            self.cur_heads[i] = (self.heads[i] + mframe + self.shift[i]) % self.nLed # <- target leds
        self.cur_heads[0] = (self.cur_heads[0] + int(0.5 * mframe)) % self.nLed
        self.cur_heads[1] = (self.cur_heads[1] + int(0.5 * mframe)) % self.nLed
        #print(self.shift)
        super().update_leds(frame, strip)

    def get_gradient_index(self, led, frame):
        #heads = [0, 150, 300, 375]
        min_dist = self.nLed
        min_i = -1
        for i in range(len(self.cur_heads)):
            head = self.cur_heads[i]
            dist = (head - led) % self.nLed
            if dist < min_dist:
                min_dist = dist
                min_i = i
        if min_dist < 0 or min_dist > 18:
            y = 0
        else:
            if min_i == 0 or min_i == 1:
                y = 38 - min_dist
            else:
                y = 19 - min_dist
        return y



    """
    0123456789
    |.....|...     0, 6    
    .|......|.
    ..|......|
    
    x = 2
    
    ni y x-ni
    48 1  -46
    49 2  -47
    0  3  2
    1  4  1
    2  5  0
    """

    

