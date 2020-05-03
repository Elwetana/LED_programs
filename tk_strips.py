from tkinter import *
import matplotlib
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from math import ceil, floor

matplotlib.use("TkAgg")


class DummyStrip:
    def __init__(self):
        pass

    def begin(self):
        pass

    def setPixelColor(self, i, color):
        pass

    def show(self):
        pass


class TkStrip:
    LED_WIDTH = 6
    LED_HEIGHT = 16
    LED_SPACE = 2
    LED_PER_ROW = 150

    def __init__(self, nLed, app):
        self.app = app
        self.root = Tk()
        self.leds = []
        max_w = (TkStrip.LED_WIDTH + TkStrip.LED_SPACE) * TkStrip.LED_PER_ROW
        max_h = (TkStrip.LED_HEIGHT + TkStrip.LED_SPACE) * ceil(nLed / TkStrip.LED_PER_ROW)
        self.w = Canvas(self.root, width=max_w, height=max_h)
        self.w.pack()
        for i in range(nLed):
            x = (i % TkStrip.LED_PER_ROW) * (TkStrip.LED_WIDTH + TkStrip.LED_SPACE) + TkStrip.LED_SPACE // 2
            y = (i // TkStrip.LED_PER_ROW) * (TkStrip.LED_HEIGHT + TkStrip.LED_SPACE) + TkStrip.LED_SPACE // 2
            self.leds.append(self.w.create_rectangle(x, y, x + TkStrip.LED_WIDTH, y + TkStrip.LED_HEIGHT,
                                                     fill="white", width=0))

    def begin(self):
        self.show()
        self.root.mainloop()

    def setPixelColor(self, i, color):
        self.w.itemconfig(self.leds[i], fill=color)

    def show(self):
        self.root.after(1, self.app.update)

class TkPlot:
    def __init__(self, nLed, app):
        self.app = app
        self.nLed = nLed
        self.root = Tk()
        self.figure = Figure(figsize=(10, 4), dpi=100)
        self.plot = self.figure.add_subplot(1, 1, 1)
        self.canvas = FigureCanvasTkAgg(self.figure, self.root)
        self.canvas.get_tk_widget().grid(row=0, column=0)
        self.yvals = [0] * nLed

    def begin(self):
        self.show()
        self.root.mainloop()

    def setPixelColor(self, i, color):
        self.yvals[i] = color

    def show(self):
        xvals = range(self.nLed)
        self.plot.clear()
        self.plot.scatter(xvals, self.yvals, [4] * self.nLed, marker='s')
        self.plot.axis([0, self.nLed, 0, 1])
        self.canvas.draw()
        self.root.after(1, self.app.update)
