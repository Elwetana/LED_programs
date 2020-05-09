from basic_source import  BasicSource
import sys


class MorseChar:
    def __init__(self):
        self.length = 0
        self.data = [0] * 16 #<- timing of signal, e.g. k (-.-) is 222010222, length 9

    def __str__(self):
        return "Len: %s, data: %s" % (self.length, self.data)

    def __repr__(self):
        return "Len: %s, data: %s" % (self.length, self.data)


class MorseSource(BasicSource):
    font3x5 = [
        #  A      B      C      D      E      F      G      H      I      J      K      L      M      N      O
        [0,1,0, 1,1,0, 0,1,1, 1,1,0, 1,1,1, 1,1,1, 0,1,1, 1,0,1, 1,1,1, 1,1,1, 1,0,1, 1,0,0, 1,0,1, 1,0,1, 0,1,0, ],
        [1,0,1, 1,0,1, 1,0,0, 1,0,1, 1,0,0, 1,0,0, 1,0,0, 1,0,1, 0,1,0, 0,0,1, 1,0,1, 1,0,0, 1,1,1, 1,1,1, 1,0,1, ],
        [1,0,1, 1,1,0, 1,0,0, 1,0,1, 1,1,1, 1,1,1, 1,1,1, 1,1,1, 0,1,0, 0,0,1, 1,1,0, 1,0,0, 1,1,1, 1,1,1, 1,0,1, ],
        [1,1,1, 1,0,1, 1,0,0, 1,0,1, 1,0,0, 1,0,0, 1,0,1, 1,0,1, 0,1,0, 1,0,1, 1,0,1, 1,0,0, 1,0,1, 1,1,1, 1,0,1, ],
        [1,0,1, 1,1,0, 0,1,1, 1,1,0, 1,1,1, 1,0,0, 0,1,1, 1,0,1, 1,1,1, 0,1,0, 1,0,1, 1,1,1, 1,0,1, 1,0,1, 0,1,0, ]
    ]
    sfw = 3
    sfh = 5

    fw = 5
    fh = 7
    #         A     B       C       D      E    F       G      H       I     J      K      L       M
    cmorse = [".-", "-...", "-.-.", "-..", ".", "..-.", "--.", "....", "..", ".---","-.-", ".-..", "--",
              "-.", "---", ".--.", "--.-", ".-.", "...", "-", "..-", "...-", ".--", "-..-", "-.--", "--.."]

    def __init__(self, ts, output_type):
        super().__init__(ts, output_type)
        self.text = "AHOJ URSULO"
        ffont = open("font_5x7.bmp", "rb")
        ffont.seek(0x0A)
        buf = ffont.read(4)
        offset = buf[0] | buf[1] << 8 | buf[2] << 16 | buf[3] << 24
        print(offset)
        ffont.seek(offset)

        self.font = []
        for y in range(7):
            self.font.append([1] * MorseSource.fw * 26)
        for y in range(7):
            row = ffont.read((MorseSource.fw + 1) * 26)
            column = 0
            for x in range((MorseSource.fw + 1) * 26):
                if x % (MorseSource.fw + 1) == MorseSource.fw:
                    continue
                if row[x] > 0:
                    self.font[6-y][column] = 0
                column += 1

        self.morse = []
        for m in MorseSource.cmorse:
            mc = MorseChar()
            mc.length = 0
            for i in range(len(m)):
                if m[i] == '-':
                    for j in range(3):
                        mc.data[mc.length] = 2
                        mc.length += 1
                else:
                    mc.data[mc.length] = 1
                    mc.length += 1
                mc.data[mc.length] = 0
                mc.length += 1
            mc.length -= 1
            self.morse.append(mc)

        # Debug output
        for row in self.font:
            s = ""
            for c in row:
                if c == 0:
                    s += " "
                else:
                    s += "X"
            print(s)

        print(self.morse)

    def get_colors(self):
        return [("#FFFFFF", 1), ("#000000", 1), ("#FF0000", 6), ("#0000FF", 1)]

    def update_leds_morse(self, frame: int, strip):
        for i in range(self.nLed):
            y = 0
            strip.setPixelColor(i, self.gradient[y])

        # now render the text
        offset = 1
        msg = [0] * self.nLed
        for index in range(len(self.text)):
            c = self.text[index]
            if c == " ":
                offset += 7
                continue
            letter_color = (index % 6) + 2
            code = MorseSource.cmorse[ord(c) - 65]
            for dd in code:
                if dd == ".":
                    msg[offset] = letter_color
                    offset +=2
                if dd == "-":
                    msg[offset] = letter_color
                    msg[offset+1] = letter_color
                    msg[offset+2] = letter_color
                    offset += 4
            offset += 3
        offset -= 3

        mframe = frame % self.nLed
        for i in range(len(msg)):
            strip.setPixelColor((self.nLed + i - mframe) % self.nLed, self.gradient[msg[i]])
        strip.setPixelColor((self.nLed - mframe) % self.nLed, self.gradient[1])
        strip.setPixelColor((self.nLed + offset - mframe) % self.nLed, self.gradient[1])

    def get_gradient_index(self, led, frame):
        return self.get_gradient_index_scroll(led, frame)

    def get_gradient_index_blink(self, led, frame):
        frame_per_dot = 4
        msg_padding = 3
        shift = frame // (frame_per_dot * 16)
        led = (led + shift) % self.nLed

        msg_length = len(self.text)
        i = led % (msg_length + msg_padding)
        if i >= msg_length:
            return 1
        letter_color = i % 6
        c = self.text[i]
        if c == " ":
            return 0
        i = ord(c) - 65
        mc = self.morse[i]
        ft = frame % (frame_per_dot * 16)
        if ft >= (frame_per_dot * mc.length):
            return 0
        y = mc.data[ft // frame_per_dot]
        if y > 0:
            return 2 + letter_color
        return 0

    def get_gradient_index_scroll(self, led, frame):
        font_row = frame % (MorseSource.fh + 10)
        char_number = led // (MorseSource.fw + 1)
        # print(self.text[char_number])
        char_number = char_number % (len(self.text) + 1)
        if char_number >= len(self.text):
            return 1
        letter_color = (char_number % 6) + 2
        font_column = led % (MorseSource.fw + 1)
        if font_column == MorseSource.fw:  # this is interspace column
            return 1
        if self.text[char_number] == " ":  # space is all empty
            return 0
        if font_row >= MorseSource.fh:  # this is leading
            return 0
        font_column = (ord(self.text[char_number]) - 65) * MorseSource.fw + font_column
        # print(self.text[char_number], font_col)
        return self.font[font_row][font_column] * letter_color

    def update_leds(self, frame: int, strip):
        mode = (frame // 100) % 3
        if mode == 0:
            self.update_leds_morse(frame, strip)
        elif mode == 1:
            for i in range(self.nLed):
                y = self.get_gradient_index_scroll(i, frame)
                strip.setPixelColor(i, self.gradient[y])
        elif mode == 2:
            for i in range(self.nLed):
                y = self.get_gradient_index_blink(i, frame)
                strip.setPixelColor(i, self.gradient[y])
