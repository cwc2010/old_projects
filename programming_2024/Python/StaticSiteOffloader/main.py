from urllib.request import urlopen
import re
import os

sitePath = "/Users/calvin/Library/Mobile Documents/com~apple~CloudDocs/Programming/2024/Python/StaticSiteOffloader/sites/"

def webscrape(url):
  page = urlopen(url)
  return page.read().decode("utf-8")
def getUrls(html, currentURL):
  #return [x.group() for x in re.finditer(r"http(s)?://[\w\-_\d/\.]+", html)]
  return[x.group() for x in re.finditer(r"[\w\-_\d/\.]+", html)]
def getHost(url):
  url = re.sub(r"^http(s)?://(\.)?","",url)
  return re.findall(r"[a-zA-Z0-9\.\-]+",url)[0]
def getPaths(url):
  return re.sub(r"^http(s)?://","",url)
def seperatePaths(path):
  return (path.split("/"))
def writePath(path, file, content):
  try:
    print("    makedirs", path) 
    os.makedirs(path)
  except:
    print("!!!ERROR making directory", path)
  try:
    fileToWrite = open(path+"/"+file, "a")
    print("    open", path+"/"+file, "with mode a")
    print("    write", "[[content]]")#content)
    fileToWrite.write(content)
    fileToWrite.close()
  except:
    print("!!!ERROR writing file", path+file)

pathsVisited = []

def recursiveScrape(scraper_url):
  if scraper_url in pathsVisited:
    return False
  pathsVisited.append(scraper_url)
  print("scraping ", scraper_url)


  scraper_url_host = getHost(scraper_url)
  html = webscrape(scraper_url)
  #writePath(sitePath+scraper_url_host, "/index.html", html)
  urls = [x for x in getUrls(html) if getHost(x) == scraper_url_host]
  for i in range(len(urls)):
    if urls[i] == None:
      del urls[i]

  for url in urls:
    try:
      #print(url)
      paths = getPaths(url)
      #print("  paths: ", paths)
      paths = seperatePaths(paths)
      if paths[-1] == "":
        del paths[-1]
      if len(paths) <= 1:
        continue
      #print("  paths: ", paths)
      data = recursiveScrape(url)
      if data != False:
        writePath(sitePath+"/".join(paths[:-1]), paths[-1], data)
    except:
      print("!!!ERROR on ", url)
  return html
recursiveScrape("https://webscraper.io/test-sites/e-commerce/allinone")

