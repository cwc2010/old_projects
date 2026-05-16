import pyautogui as pag
import keyboard
from time import sleep
def run():
    cycleTypes = [1,0.5,0.3,0.2,0.1,0.05,0.03,0.02,0.01,0.008,0.006,0.005,0.004,0.003,0.002,0.001,0]
    cycleNumber = 0
    button = "left"
    print("pag.PAUSE =", cycleTypes[cycleNumber])
    print("button =", button)
    while 1:
        sleep(0.1)
        if keyboard.is_pressed("["):
            cycleNumber += 1
            cycleNumber %= len(cycleTypes)
            pag.PAUSE = cycleTypes[cycleNumber]
            print("set pyautogui.PAUSE to", pag.PAUSE)
        if keyboard.is_pressed("]"):
            button = "left" if button == "right" else "right"
            print("set button to ", button)
        if keyboard.is_pressed(";"):
            print("starting " + button + " click with PAUSE ", pag.PAUSE)
            time = 0
            while 1:
                if time % 10 == 0:
                    if keyboard.is_pressed("'"):
                        print("stopping")
                        break
                x,y=pag.position()
                pag.click(x,y,button=button)



run()

