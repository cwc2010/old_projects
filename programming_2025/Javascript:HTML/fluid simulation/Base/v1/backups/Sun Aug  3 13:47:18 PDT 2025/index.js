const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
const fs = require("fs")
const os = require("os")
const networkInterfaces = os.networkInterfaces()

app.use(express.static("public"))

http.listen(3000, () => {
  console.log("hosting on: ")
  for (let type in networkInterfaces) {
    for (let i of networkInterfaces[type]) {
      if (i.family == "IPv4") {
        console.log(i.address + ":3000")
      }
    }
  }
  console.log("localhost:3000")
})

