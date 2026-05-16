let output = document.getElementById("output")
let skipElement = document.getElementById("skip")
let resetElement = document.getElementById("reset")
let aidepthElement = document.getElementById("aidepth")
let aiaccuracyElement = document.getElementById("aiaccuracy")


// Connect 4 Game in JavaScript (Single-threaded, No multithreading)

const boardSizeX = 7
const boardSizeY = 6
const inRow = 4
const intMin = -2147483647
const intMax = 2147483647

function nextTurn(turn) {
    return (turn % 2) + 1
}

function createBoard() {
    return Array.from({ length: boardSizeY }, () => Array(boardSizeX).fill(0))
}

function boardToHTML(board) {
    let outputstream = ""
    for (let i = 0; i < boardSizeX; ++i) {
        outputstream += `<div class="gameRow js-row${i}">`//`<div class="textblock">${i+1}</div><br>`
        for (let j = 0; j < boardSizeY; ++j) {
            let cell = board[j][i]
            outputstream += `<div class="${(cell === 0 ? "empty" : (cell === 1 ? "red" : "yellow"))}"></div><br>`
        }
        outputstream += "</div>"
    }
    outputstream += "<br>"
    /*for (let i = 1; i <= boardSizeX; ++i) {
        outputstream += `<div class="none">${i}</div> `
    }
    outputstream += "<br>"
    for (const row of board) {
        for (const cell of row) {
            outputstream += `<div class="${(cell === 0 ? "empty" : (cell === 1 ? "red" : "yellow"))}"></div> `
        }
        outputstream += "<br>"
    }*/
    return outputstream
}

function move(board, turn, x) {
    for (let y = boardSizeY - 1; y >= 0; --y) {
        if (board[y][x] === 0) {
            board[y][x] = turn
            return
        }
    }
}

function getMoveY(board, x) {
    for (let y = boardSizeY - 1; y >= 0; --y) {
        if (board[y][x] === 0) return y
    }
}

function checkForWinRow(board, modX, modY, changeX, changeY, turn) {
    let currentInRow = 0
    for (let step = -inRow + 1; step <= inRow; ++step) {
        const x = modX + changeX * step
        const y = modY + changeY * step
        if (x < 0 || x >= boardSizeX || y < 0 || y >= boardSizeY) continue
        if (board[y][x] !== turn) {
            currentInRow = 0
        } else {
            currentInRow++
            if (currentInRow === inRow) return true
        }
    }
    return false
}

function checkForWin(board, modX, modY) {
    const turn = board[modY][modX]
    return checkForWinRow(board, modX, modY, 1, 0, turn) ||
           checkForWinRow(board, modX, modY, 0, 1, turn) ||
           checkForWinRow(board, modX, modY, 1, 1, turn) ||
           checkForWinRow(board, modX, modY, 1, -1, turn)
}

function checkForTie(board) {
    return board[0].every(cell => cell !== 0)
}

function getScore(board, depth, turn, isMax, alpha = intMin, beta = intMax) {
    if (depth === 0) return 0
    let bestScore = isMax ? intMin : intMax

    for (let x = 0; x < boardSizeX; ++x) {
        if (board[0][x] !== 0) continue
        const y = getMoveY(board, x)
        board[y][x] = turn

        if (checkForWin(board, x, y)) {
            board[y][x] = 0
            return (depth + 1) * (isMax ? 1 : -1)
        }

        if (checkForTie(board)) {
            board[y][x] = 0
            return 0
        }

        let score = 0
        if (Math.random() < aiaccuracy/100) {
          score = getScore(board, depth - 1, nextTurn(turn), !isMax, alpha, beta)
        } else {
            console.log(3)
        }

        board[y][x] = 0
        if (isMax) {
            bestScore = Math.max(bestScore, score)
            alpha = Math.max(alpha, score)
            if (score >= beta) return score
        } else {
            bestScore = Math.min(bestScore, score)
            beta = Math.min(beta, score)
            if (score <= alpha) return score
        }
    }

    return (bestScore === intMax || bestScore === intMin) ? -1 : bestScore
}

function getBestMove(board, depth, turn) {
    let bestScore = intMin
    let bestMove = -1

    for (let x = 0; x < boardSizeX; ++x) {
        if (board[0][x] !== 0) continue
        const y = getMoveY(board, x)
        board[y][x] = turn

        const score = checkForWin(board, x, y)
            ? intMax
            : getScore(board, depth - 1, nextTurn(turn), false)

        board[y][x] = 0

        if (score > bestScore) {
            bestScore = score
            bestMove = x
        }
    }

    return bestMove
}

let rowClicked = -1
addEventListener("click", (e) => {

    let classList = [...e.target.classList]
    if (!classList.includes("gameRow")) {
        classList = [...e.target.parentElement.classList]
        if (!classList.includes("gameRow")) return
    }
    for (let name of classList) {
        if (/js-row[0-9]+/.test(name)) {
            rowClicked = parseInt(name.slice(6))
        }
    }
})
addEventListener("touchstart", (e) => {

    let classList = [...e.touches[0].target.classList]
    if (!classList.includes("gameRow")) {
        classList = [...e.touches[0].target.parentElement.classList]
        if (!classList.includes("gameRow")) return
    }
    for (let name of classList) {
        if (/js-row[0-9]+/.test(name)) {
            rowClicked = parseInt(name.slice(6))
        }
    }
})
let isPlaying = false
skipElement.addEventListener("click", (e) => {
    rowClicked = "skip"
})
resetElement.addEventListener("click", (e) => {
    if (confirm("Are you sure you want to reset the board?")) {
        if (isPlaying) {
            rowClicked = "reset"
        } else {
            playGame()
        }
    }
})

let aidepth = aidepthElement.value
aidepthElement.addEventListener("input", (e) => {
    aidepth = parseInt(aidepthElement.value)
})
let aiaccuracy = aiaccuracyElement.value
aiaccuracyElement.addEventListener("input", (e) => {
    aiaccuracy = parseInt(aiaccuracyElement.value)
})
function promptAsync(message) {
    return new Promise((res,rej)=>{
        let interval = setInterval(()=>{
            if (rowClicked != -1) {
                clearInterval(interval)
                res(rowClicked)
                rowClicked = -1
            }
        },100)
    })
}

async function playGame() {
    let board = createBoard()
    let turn = 1
    
    output.innerHTML = boardToHTML(board)
    while (true) {
        isPlaying = true
        //output.innerHTML += `Player ${turn === 1 ? "red" : "yellow"}:`
        let placeX
        if (turn === 1) {
            placeX = await promptAsync("Column (1-7): ")
            if (placeX == "skip") {
                turn = nextTurn(turn)
                continue
            } else if (placeX == "reset") {
                board = createBoard()
                output.innerHTML = boardToHTML(board)
                continue
            }
        } else {
            placeX = getBestMove(board, aidepth, turn)
            //output.innerHTML += `AI chooses: ${placeX + 1}`
        }

        if (placeX < 0 || placeX >= boardSizeX || board[0][placeX] !== 0) {
            //output.innerHTML = "Invalid Move"
            continue
        }

        const placeY = getMoveY(board, placeX)
        move(board, turn, placeX)

        output.innerHTML = boardToHTML(board)
        if (checkForWin(board, placeX, placeY)) {
            output.innerHTML += `${turn === 1 ? "Red" : "Yellow"} wins`
            break
        }
        if (checkForTie(board)) {
            output.innerHTML += "Tie"
            break
        }

        turn = nextTurn(turn)
    }
    isPlaying = false
}

playGame()
