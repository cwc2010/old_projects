const socket = io()

socket.emit("request", "0 1")

socket.on("stdout", (data) => {
  console.log(data)
})