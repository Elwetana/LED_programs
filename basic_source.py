#! /usr/bin/python

from typing import List, Tuple


class BasicSource:
    def __init__(self, time_speed):
        self.nLed = 0
        self.time_speed = time_speed

    @staticmethod
    def bias(x, w):
        # return x ** (log(w) / log(2))
        return x / ((((1.0 / w) - 2.0) * (1.0 - x)) + 1.0)

    @staticmethod
    def gain(x, w):
        if x < 0.5:
            return BasicSource.bias(x * 2.0, w) / 2.0
        else:
            return 1.0 - BasicSource.bias(2.0 - x * 2.0, w) / 2.0

    def init(self, n_led):
        self.nLed = n_led

    def get_colors(self) -> List[Tuple]:
        # the number of step should add to 101, but if it is more, the extra colors will simply never be used
        return [("#000000", 101), ("#FFFFFF",)]

    def get_values(self, frame: int) -> List[float]:
        return [0]
