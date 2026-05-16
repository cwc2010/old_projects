import cv2
import numpy as np
import os
import math

dir_path = os.path.dirname(os.path.realpath(__file__))
photos_path = os.path.join(dir_path, "photos")
photo = cv2.imread(os.listdir(photos_path)[0])
print(photo)
photo = cv2.resize(photo, (125, 125)) # width, height
photo = cv2.putText(photo,  
  "Hi",  
  (2000, 2000),  
  fontFace=cv2.FONT_HERSHEY_COMPLEX,  
  fontScale=20,
  color=(255, 255, 255)) 
cv2.imwrite(os.path.join(dir_path, "out.png"), photo)