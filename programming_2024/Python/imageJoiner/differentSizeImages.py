import cv2
import numpy as np
import os
import math

dir_path = os.path.dirname(os.path.realpath(__file__))
photos_path = os.path.join(dir_path, "photos")
photos = [cv2.imread(x) for x in os.listdir(photos_path) if x != ".DS_Store"]
maxHeight = 0
maxWidth = 0
for photo in photos:
  height, width, _ = photo.shape
  if height > maxHeight:
    maxHeight = height
  if width > maxWidth:
    maxWidth = width
for i in range(len(photos)):
  photos[i] = cv2.resize(photos[i], (maxWidth, maxHeight))
print(len(photos))
rows = 2
rowSize = 2
h_photos = []
for i in range(0, rows*rowSize, rowSize):
  h_photos.append(cv2.hconcat(photos[i:i+rowSize]))
cv2.imwrite(os.path.join(dir_path, "out.png"), cv2.vconcat(h_photos))