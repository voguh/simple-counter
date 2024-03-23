let COUNTER_ID = 'counter'
let ALLOW_MOCK = false
let TIP_THRESHOLD = 5
let SUB_THRESHOLD = 1
let CHEER_THRESHOLD = 100
let ignoredSubGifts = 0

async function getCounterValue() {
  try {
    const data = await SE_API.store.get(COUNTER_ID)

    if (data == null || data.value == null) {
      return 0
    }

    return data.value
  } catch (e) {
    return 0
  }
}

/* ================================================================================================================== */

const updateCounterQueue = async.queue(async (amount) => {
  const counterValue = await getCounterValue()
  await SE_API.store.set(COUNTER_ID, { value: counterValue + amount })
}, 1)
const actionsQueue = async.queue(async ({ action, args }) => action.apply(this, args), 1)

/* ================================================================================================================== */

async function resetCounter(amount) {
  updateCounterQueue.kill()
  actionsQueue.kill()
  const value = Number(amount || '0')
  await SE_API.store.set(COUNTER_ID, { value })
}

/* ================================================================================================================== */

async function addCounter(amount) {
  const value = Number(amount || '1')
  updateCounterQueue.push(value)
}

async function subCounter(amount) {
  const value = Number(amount || '1')
  updateCounterQueue.push(-value)
}

function onStreamAction(amount, threshold) {
  if (amount >= threshold) {
    updateCounterQueue.push(Math.floor(amount / threshold) ?? 1)
  }
}

/* ================================================================================================================== */

window.addEventListener('onWidgetLoad', async function (obj) {
  const detail = obj.detail
  ALLOW_MOCK = detail.fieldData.allowMock ?? ALLOW_MOCK
  COUNTER_ID = detail.fieldData.counterName ?? COUNTER_ID
  TIP_THRESHOLD = detail.fieldData.tipThreshold ?? TIP_THRESHOLD
  SUB_THRESHOLD = detail.fieldData.subThreshold ?? SUB_THRESHOLD
  CHEER_THRESHOLD = detail.fieldData.cheerThreshold ?? CHEER_THRESHOLD

  const counterValue = await getCounterValue()
  $('.main-container').text(counterValue)
})

window.addEventListener('onEventReceived', async function (obj) {
  const detail = obj.detail

  if (detail.listener === 'event') {
    const event = detail.event
    const data = event.data

    if (ALLOW_MOCK || event.isMock !== true) {
      switch (event.type) {
        case 'tip':
          actionsQueue.push({ action: onStreamAction, args: [data.amount, TIP_THRESHOLD] })
          break
        case 'subscriber':
          if (ignoredSubGifts === 0) {
            actionsQueue.push({ action: onStreamAction, args: [1, SUB_THRESHOLD] })
          } else if (data.gifted) {
            ignoredSubGifts--
          }
          break
        case 'communityGiftPurchase':
          actionsQueue.push({ action: onStreamAction, args: [data.amount, SUB_THRESHOLD] })
          ignoredSubGifts += data.amount
          break
        case 'cheer':
          actionsQueue.push({ action: onStreamAction, args: [data.amount, CHEER_THRESHOLD] })
          break
      }
    }
  } else if (detail.listener === 'message') {
    const event = detail.event
    const data = event.data

    if (data.tags.badges.includes('broadcaster') || data.tags.badges.includes('moderator')) {
      const text = (data.text ?? '').trim()
      const [command, amount] = text.split(' ')
      switch (command) {
        case `!${COUNTER_ID}add`:
          actionsQueue.push({ action: addCounter, args: [amount || '1'] })
          break
        case `!${COUNTER_ID}sub`:
          actionsQueue.push({ action: subCounter, args: [amount || '1'] })
          break
        case `!${COUNTER_ID}reset`:
          await resetCounter(amount || '0')
          break
      }
    }
  } else if (detail.listener === 'event:test') {
    const event = obj.detail.event

    if (event.listener === 'widget-button') {
      switch (event.field) {
        case 'resetCounter':
          await resetCounter()
          break
        case 'addOne':
          actionsQueue.push({ action: addCounter, args: ['1'] })
          break
        case 'addTen':
          actionsQueue.push({ action: addCounter, args: ['10'] })
          break
        case 'subOne':
          actionsQueue.push({ action: subCounter, args: ['1'] })
          break
        case 'subTen':
          actionsQueue.push({ action: subCounter, args: ['10'] })
          break
      }
    }
  } else if (detail.listener === 'kvstore:update') {
    const event = detail.event
    const data = event.data
    $('.main-container').text(data.value.value)
  }
})
