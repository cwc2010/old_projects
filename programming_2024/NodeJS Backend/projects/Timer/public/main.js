const button = document.getElementById("button")
const timeleft = document.getElementById("output")
const times = document.querySelectorAll(".js-time")
const url = document.getElementById("url")
const title = document.getElementById("title")

function convertToMS(h,m,s) {
  m += h * 60
  s += m * 60
  return s*1000
}
// hours, minutes, seconds
function convertToHMS (ms) {
  let times = [0,0,0,0]
  times[3] = ms % 1000
  times[2] = Math.floor((ms % (1000*60))/1000)
  times[1] = Math.floor((ms % (1000*60*60))/(1000*60))
  times[0] = Math.floor(ms/(1000*60*60))
  return times
}
function addZeros(string, length) {
  string = string + ""
  if (length > string.length) {
    return "0".repeat(length - string.length) + string
  }
  return string
}

button.addEventListener("click", () => {
  try {
    open("about:blank").close()
    open("about:blank").close()
    open("about:blank").close()
  } catch (e) {
    timeleft.innerText = "allow popups to start the timer"
    return
  }
  timerStarted = true
  timerStart = Date.now()
  timerDuration = convertToMS(+times[0].value, +times[1].value, +times[2].value)
  open(url.value)
})
let timerStarted = false
let timerStart = 0
let timerDuration = 0
let timeText = "Timer"
setInterval(() => {
  if (timerStarted) {
    let timeLeftMS = timerDuration - (Date.now() - timerStart)
    if (timeLeftMS <= 0) {
      timeLeftMS = 0
      timeText = "Timer Done!"
      timeleft.innerText = timeText
      timerStarted = false
      open("/timeup.html")
      return
    }
    // hours, minutes, seconds
    let hms = convertToHMS(timeLeftMS)
    timeText = `${addZeros(hms[0],2)}h:${addZeros(hms[1],2)}m:${addZeros(hms[2],2)}s`
    timeleft.innerText = timeText + ":" + addZeros(hms[3],3) + "ms"
  }
})
setInterval(() => {
  title.innerText = timeText
},500)