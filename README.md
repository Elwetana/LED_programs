# LED_programs
Small programs for ws281x LEDs controlled from Raspberry Pi

The original idea was to write this all in Python, with multiple possible sources and outputs. In the end,
however, it turns out that Raspberry Pi (3B+ in my case) is not powerful enough. I was never able to achieve
more than ~8 fps. So in the end I rewrote the source algorithms in plain C, you can find the imlemenations 
in the repository https://github.com/Elwetana/LED_controller. The maximum framerate of the C implementation is 
about 100 fps, so the difference is the cost of Python's user-friendliness.

The Pyton programs are still useful, though. There are two main things:

* HTTP server (including HTML file) that is used to control the leds. For communication between this server
  and LED controller I am using ZeroMQ.
  
* led_sky_and_fire.py: this is useful for prototyping new sources, it can show the results either on fake
  LED display, on a graph or write to a file (this is useful for comparing animation on Python and C).
