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
video = cv2.VideoWriter("output.mp4", cv2.VideoWriter_fourcc(*"mp4v"), 60, (width, height))

x = 1
imgslen = len(imgs)
times = []
starttime = time.perf_counter()
for img in imgs:
    video.write(cv2.imread(os.path.join(inputimgs, img)))
    if True or x%10==0:
        delay = time.perf_counter() - starttime
        print(str(round(x/imgslen*100))+"% done", delay)
        times.append(delay)
        starttime = time.perf_counter()
        # avgtime = sum(times)/len(times)
    x+=1
cv2.destroyAllWindows()
video.release()
print("\a",times)