passwords = {
    "LVL0": "heslo",
    "LVL1": "Na konci duhy",
    "LVL2": "Najdete poklad",
    "LVL3": "a duha roste",
    "LVL4": "jako z vody"
}

with open("message.html", "r", encoding='UTF8') as f_in:
    lines = f_in.readlines()

password = []
cur_level = ""
output = {}
counter = 0
for line in lines:
    if line[0] == ":" and line[-2] == ":":  # set password
        cur_level = line[1:-2]
        password = [ord(x) for x in passwords[cur_level]]
        output[cur_level] = ""
        counter = 0
        continue
    for c in line:
        n = (ord(c) ^ password[counter])
        if n > 999:
            print("Too big " + c)
        output[cur_level] += f'{n:03X}'
        counter = (counter + 1) % len(password)
for lvl in output:
    print("<div id=\"level%s\" data-content=\"%s\">" % (lvl[-1], output[lvl]))
    print("</div>")
