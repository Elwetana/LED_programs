#! /usr/bin/python

from typing import List, Tuple
import colour


# The following should be some inherited class, BasicGradientSource
class BasicSource:
    def __init__(self, time_speed, output_type):
        self.nLed = 0
        self.time_speed = time_speed
        self.gradient = []
        led_colors = self.get_colors()
        for i in range(len(led_colors) - 1):
            for c in colour.Color(led_colors[i][0]).range_to(colour.Color(led_colors[i + 1][0]), led_colors[i][1]):
                if output_type == "LED":
                    val = (BasicSource.float2int(c.red) << 16) | (BasicSource.float2int(c.green) << 8) | BasicSource.float2int(c.blue)
                    self.gradient.append(val)
                elif output_type == "HEX":
                    self.gradient.append(c.hex)
                elif output_type == "Y":
                    self.gradient.append(len(self.gradient) / 100)

    def get_colors(self) -> List[Tuple]:
        # the number of step should add to 101, but if it is more, the extra colors will simply never be used
        return [("#000000", 101), ("#FFFFFF",)]

    @staticmethod
    def float2int(c):
        FLOAT_ERROR = 0.0000005
        return int(c * 255 + 0.5 - FLOAT_ERROR)

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

    def update_leds(self, frame: int, strip):
        for i in range(self.nLed):
            y = self.get_gradient_index(i, frame)
            if y > len(self.gradient) - 1:
                print(y)
            strip.setPixelColor(i, self.gradient[y])

    def get_gradient_index(self, i, frame):
        """
        This is the function to override in the implementations
        :param i:
        :param frame:
        :return:
        """
        return i % len(self.gradient)

