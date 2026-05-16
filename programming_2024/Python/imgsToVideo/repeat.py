print("running\a")
import time
import os
import re
import cv2

thisdir = os.path.dirname(__file__)
inputimgs = os.path.join(thisdir,"input")
print("sorting out png files..")
files = [f for f in os.listdir(inputimgs) if re.match(r'^\d+.png', f)]
print("numerically sorting files")
imgs = sorted(files, key=lambda k: int(k.split(".")[0]))

frame = cv2.imread(os.path.join(inputimgs, imgs[0]))
height, width, layers = frame.shape

print("writing video..")
video = cv2.VideoWriter("output.mp4", cv2.VideoWriter_fourcc(*"mp4v"), 65535, (width, height))

x = 1
repeat = 60
total = len(imgs)*repeat
times = []
starttime = time.perf_counter_ns()
for _ in range(repeat):
    for img in imgs:
        video.write(cv2.imread(os.path.join(inputimgs, img)))
        if x%1000 == 0:
            print(round((x*100)/total,1))
        x+=1
cv2.destroyAllWindows()
video.release()
print("\a",times)