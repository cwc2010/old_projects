async function ai(prompt) {
  return new Promise((res)=>{
    $.ajax({
      url: 'apis/boredagi_api.php',
      type: 'POST',
      data: {
        'prompt': encodeURIComponent(prompt),
        'uid': Date.now().toString(36) + Math.random().toString(36).substr(2),
        'sesh_id': '11f84a58-abb6-4a04-80c3-2f5ca027d08a',
        'get_tool': 'false',
        'tool_num': '89'
      },
      success: function(response) {
        res(JSON.parse(response).output)
      }
    })
  })
}

async function superAI(prompt, amount = 4, aiCallback = ai) {
  let responses = []
  for (let i = 0; i < amount; i++) {
    responses.push(aiCallback(prompt))
  }
  responses = await Promise.all(responses)
  let newPrompt = "There are " + amount + " answers to a question. Some of the answers may not be correct. Your job is to take the various answers and merge the content into a final answer. Do not explain why you chose your final answer. The question is: \n\n    " + prompt + "\n\n"
  for (let i = 0; i < responses.length; i++) {
    newPrompt += "Answer " + (i+1) + ": " + responses[i] + "\n\n"
  }
  console.log("New prompt: " + newPrompt)
  return await aiCallback(newPrompt)
}