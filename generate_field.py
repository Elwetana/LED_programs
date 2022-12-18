import random
N_COLOURS = 6

def check_swaps(field: list):
    swaps = 0
    counter = 0
    last_colour = -1
    print(field)
    for idx, x in enumerate(field):
        if x != last_colour:
            last_colour = x
            counter = 1
        else:
            counter += 1
        if counter == 3:
            print("field not valid: %s at %s" % (x, idx))
        elif counter == 2:  # [0, 1, 0, 0], [0, 0, 1, 0]
            if idx > 2 and field[idx - 3] == last_colour:
                swaps += 1
                # print("swap found for %s at %s" % (last_colour, idx - 3))
            elif idx < len(field) - 3 and field[idx + 2] == last_colour:
                swaps += 1
                # print("swap found for %s at %s" % (last_colour, idx + 2))
    return swaps


def check_swaps_many(field: list):
    swaps = [ [0, 0] for i in range(N_COLOURS) ]   # count, start_index, last_index (of the last match)
    counter = 0
    last_colour = -1
    for idx, x in enumerate(field):
        if x != last_colour:
            last_colour = x
            counter = 1
        else:
            counter += 1
        if counter == 3:
            print("field not valid: %s at %s" % (x, idx))
        elif counter == 2:  # [0, 1, 0, 0], [0, 0, 1, 0]
            if idx > 2 and field[idx - 3] == last_colour:
                swaps[last_colour][0] += 1
                swaps[last_colour][1] = idx - 2
                # print("swap found for %s at %s" % (last_colour, idx - 3))
            elif idx < len(field) - 3 and field[idx + 2] == last_colour:
                swaps[last_colour][0] += 1
                swaps[last_colour][1] = idx
                # print("swap found for %s at %s" % (last_colour, idx + 2))
    return swaps



def generate_unambiguous(N):
    l = [0, 0, 0]
    insert_index = 1
    for i in range(N - 1):
        col = (1 + i) % N_COLOURS
        l = l[:insert_index] + [col, col, col] + l[insert_index:]
        left_or_right = (-1 if random.random() < 0.5 else 2)
        swap_index = insert_index + left_or_right
        # print(l, swap_index)
        tmp = l[swap_index]
        l[swap_index] = l[swap_index + 1]
        l[swap_index + 1] = tmp
        if left_or_right < 0:
            insert_index = swap_index + random.randint(1, 3)
        else:
            insert_index = swap_index + random.randint(-1, +1)
        n_swaps = check_swaps(l)
        if n_swaps != 1:
            print("ERROR")
        # print(l, swap_index)
    return l


def check_insert_point(field, ins_index, colour):
    for i in range(4):
        if field[ins_index + i -2] == colour:
            return False
    return True

def generate_ambiguous(N):
    l = [1, 5, 4, 4, 1, 2, 1, 0, 3, 5, 5, 0, 5, 0, 1, 1, 2, 2, 1, 3, 3, 0, 1, 4, 5, 5, 1, 2, 2, 1, 0, 0, 3, 1, 0, 2, 0, 2, 5, 3, 4, 2, 3, 2, 2, 3, 5, 4, 4, 0, 5, 0, 1, 2, 1, 3, 4, 4, 3, 5, 4, 3, 5, 2, 2, 1, 3, 1, 1, 2, 3, 4, 4, 0, 5, 4, 4, 3, 3, 0, 3, 4, 5, 5, 2, 0, 5, 3, 1, 2, 0, 1, 5, 5, 0, 4, 4, 5, 4, 0, 1, 3, 2, 2, 4, 3, 0, 0]
    insert_index = 1
    swaps = check_swaps_many(l)
    for i in range(N):
        col = (i) % N_COLOURS
        next_col = (1 + i) % N_COLOURS
        if swaps[next_col][0] == 0: # we can insert anywhere
            insert_index = random.randint(1, len(l) - 2)
            while not check_insert_point(l, insert_index, col):
                insert_index = random.randint(1, len(l) - 2)
        else: # we must break the next colour match
            insert_index = swaps[next_col][1] + random.randint(0,2)
        l = l[:insert_index] + [col, col, col] + l[insert_index:]
        left_or_right = (-1 if random.random() < 0.5 else 2)
        swap_index = insert_index + left_or_right
        # print(l, swap_index)
        tmp = l[swap_index]
        l[swap_index] = l[swap_index + 1]
        l[swap_index + 1] = tmp
        swaps = check_swaps_many(l)
        print(l)
        print(swaps)
        for swap in swaps:
            if swap[0] > 1:
                print(i)
                print(swaps)
                return l
    return l


#generate_unambiguous(36)
ll = generate_ambiguous(12)
print(ll)