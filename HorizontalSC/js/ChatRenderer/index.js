(function(root, factory) {
  root.chatRenderer = factory(
    root._,
    root.chatRendererConstants,
    root.chatRendererTextMessage.default,
    root.chatRendererPaidMessage.default,
    root.chatRendererMembershipItem.default,
    root.chatRendererTicker.default,
  )
}(this,
/**
 * @import * as constants from './constants'
 * @import * as TextMessage from './TextMessage'
 * @import * as PaidMessage from './PaidMessage'
 * @import * as MembershipItem from './MembershipItem'
 * @import * as Ticker from './Ticker'
 * @param {typeof constants} constants
 * @param {typeof TextMessage.default} TextMessage
 * @param {typeof PaidMessage.default} PaidMessage
 * @param {typeof MembershipItem.default} MembershipItem
 * @param {typeof Ticker.default} Ticker
 */
function(_, constants, TextMessage, PaidMessage, MembershipItem, Ticker) {
  const exports = {}

  // 发送消息时间间隔范围
  // const MESSAGE_MIN_INTERVAL = 80
  // const MESSAGE_MAX_INTERVAL = 1000

  // 每次发送消息后增加的动画时间，要比MESSAGE_MIN_INTERVAL稍微大一点，太小了动画不连续，太大了发送消息时会中断动画
  // 84 = ceil((1000 / 60) * 5)
  const CHAT_SMOOTH_ANIMATION_TIME_MS = 84

  exports.default = {
    template: `
  <yt-live-chat-renderer class="style-scope yt-live-chat-app" style="--scrollbar-width:11px;" hide-timestamps>
    <div class="sc-horizontal-container">
  <transition-group name="list" tag="div" class="sc-horizontal-list">
    <div 
      v-for="message in superChats" 
      :key="message.id"
      class="sc-item-wrapper"
      :class="{ 'is-read': readList[message.id] }" 
      @click="markAsRead(message.id)"
      @mousedown.stop 
      @touchstart.stop
      :style="{ '--dynamic-font-size': getDynamicFontSize(message) }"
    >
      <paid-message 
        class="style-scope yt-live-chat-ticker-paid-message-item-renderer"
        :time="message.time"
        :avatarUrl="message.avatarUrl"
        :authorName="getShowAuthorName(message)"
        :price="message.price"
        :content="getShowContent(message)"
      ></paid-message>
      <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10;"></div>
    </div>
  </transition-group>
</div>
    <yt-live-chat-item-list-renderer class="style-scope yt-live-chat-renderer" allow-scroll style="display: none;">
      <div ref="scroller" id="item-scroller" class="style-scope yt-live-chat-item-list-renderer animated">
        <div ref="itemOffset" id="item-offset" class="style-scope yt-live-chat-item-list-renderer">
          <div ref="items" id="items" class="style-scope yt-live-chat-item-list-renderer" style="overflow: hidden"
            :style="{ transform: \`translateY(\${Math.floor(scrollPixelsRemaining)}px)\` }"
          >
            <template v-for="message in messages">
              <text-message :key="message.id" v-if="message.type === MESSAGE_TYPE_TEXT"
                class="style-scope yt-live-chat-item-list-renderer"
                :time="message.time"
                :avatarUrl="message.avatarUrl"
                :authorName="message.authorName"
                :authorType="message.authorType"
                :privilegeType="message.privilegeType"
                :contentParts="getShowContentParts(message)"
              ></text-message>
              <paid-message :key="message.id" v-else-if="message.type === MESSAGE_TYPE_GIFT"
                class="style-scope yt-live-chat-item-list-renderer"
                :time="message.time"
                :avatarUrl="message.avatarUrl"
                :authorName="getShowAuthorName(message)"
                :price="message.price"
                :priceText="message.price <= 0 ? getGiftShowNameAndNum(message) : ''"
                :content="message.price <= 0 ? '' : getGiftShowContent(message)"
              ></paid-message>
              <membership-item :key="message.id" v-else-if="message.type === MESSAGE_TYPE_MEMBER"
                class="style-scope yt-live-chat-item-list-renderer"
                :time="message.time"
                :avatarUrl="message.avatarUrl"
                :authorName="getShowAuthorName(message)"
                :privilegeType="message.privilegeType"
                :title="message.title"
              ></membership-item>
              <paid-message :key="message.id" v-else-if="message.type === MESSAGE_TYPE_SUPER_CHAT"
                class="style-scope yt-live-chat-item-list-renderer"
                :time="message.time"
                :avatarUrl="message.avatarUrl"
                :authorName="getShowAuthorName(message)"
                :price="message.price"
                :content="getShowContent(message)"
              ></paid-message>
            </template>
          </div>
        </div>
      </div>
    </yt-live-chat-item-list-renderer>
  </yt-live-chat-renderer>
    `,
    name: 'ChatRenderer',
    components: {
      Ticker,
      TextMessage,
      MembershipItem,
      PaidMessage
    },
    props: {
      maxNumber: Number,
      showGiftName: Boolean,
      mergeGift: Boolean,
    },
    data() {
      return {
        MESSAGE_TYPE_TEXT: constants.MESSAGE_TYPE_TEXT,
        MESSAGE_TYPE_GIFT: constants.MESSAGE_TYPE_GIFT,
        MESSAGE_TYPE_MEMBER: constants.MESSAGE_TYPE_MEMBER,
        MESSAGE_TYPE_SUPER_CHAT: constants.MESSAGE_TYPE_SUPER_CHAT,

        messages: [],                        // 显示的消息
        paidMessages: [],                    // 固定在上方的消息

        messagesBuffer: [],                  // 暂时未显示的消息，当不能自动滚动时会积压在这
        preinsertHeight: 0,                  // 插入新消息之前items的高度
        isSmoothed: true,                    // 是否平滑滚动，当消息太快时不平滑滚动
        chatRateMs: 1000,                    // 用来计算消息速度
        scrollPixelsRemaining: 0,            // 平滑滚动剩余像素
        scrollTimeRemainingMs: 0,            // 平滑滚动剩余时间
        lastSmoothChatMessageAddMs: null,    // 上次showNewMessages时间
        smoothScrollRafHandle: null,         // 平滑滚动requestAnimationFrame句柄
        lastSmoothScrollUpdate: null,        // 平滑滚动上一帧时间
        // 【新增】记录已读消息的 ID (使用对象 map 以支持 Vue 2 响应式)
        readList: {},
      }
    },
    // 【新增】计算属性，只提取 SuperChat 类型的消息
    computed: {
      superChats() {
        // 过滤 paidMessages，只保留 SuperChat (类型为 3)
        // 并且可以限制显示数量，比如只显示最近 20 条，防止横向太长
        return this.paidMessages.filter(
          msg => msg.type === this.MESSAGE_TYPE_SUPER_CHAT
        ).slice(0, 20);
      }
    },
    mounted() {
      this.scrollToBottom()
    },
    beforeDestroy() {
      this.clearMessages()
    },
    methods: {
      // 【新增】标记已读
      markAsRead(id) {
        // 使用 Vue.set (即 this.$set) 确保视图能检测到变化
        this.$set(this.readList, id, true);
      },
      // 【修改】根据字数计算字号 (B站规则：所有字符算1个长度，只缩小不放大)
      getDynamicFontSize(message) {
        // 获取内容，如果为空给个空字符串防报错
        const content = this.getShowContent(message) || "";
        
        // 直接获取长度（按照B站规则，中英数符号都算1）
        const len = content.length;

        // 逻辑：默认 15px。
        // 你的容器宽度 250px，15px字体一行约能放15个字。
        // 155px 总高度扣除头部，剩下约 100px 给文字，足够放 5-6 行。

        // 1. 字数 <= 30 (约2行)：保持默认大小
        if (len <= 30) {
          return '15px'; 
        } 
        // 2. 字数 31-60 (约4行)：缩第一次
        else if (len <= 60) {
          return '12px';
        }
        // 3. 字数 61-80 (满字数)：缩第二次
        else if (len <= 80) {
          return '10px'; 
        }
        // 4. 字数 81-100 (满字数)：最小号
        else {
          return '8px'; 
        }
      },
      getGiftShowContent(message) {
        return constants.getGiftShowContent(message, this.showGiftName)
      },
      getGiftShowNameAndNum: constants.getGiftShowNameAndNum,
      getShowContent: constants.getShowContent,
      getShowContentParts: constants.getShowContentParts,
      getShowAuthorName: constants.getShowAuthorName,

      mergeSimilarGift(authorName, price, _totalFreeCoin, giftName, num) {
        for (let message of this.iterRecentMessages(5)) {
          if (
            message.type === constants.MESSAGE_TYPE_GIFT
            && message.authorName === authorName
            && message.giftName === giftName
          ) {
            message.price += price
            // message.totalFreeCoin += totalFreeCoin // 暂时没用到
            message.num += num
            return true
          }
        }
        return false
      },
      // 从新到老迭代num条消息，注意不会迭代paidMessages
      *iterRecentMessages(num) {
        if (num <= 0) {
          return
        }
      let arrs = [this.messagesBuffer, this.messages]
      for (let arr of arrs) {
          for (let i = arr.length - 1; i >= 0 && num > 0; i--, num--) {
            let message = arr[i]
            yield message
          }
          if (num <= 0) {
            break
          }
        }
      },
      clearMessages() {
        this.messages = []
        this.paidMessages = []
        this.messagesBuffer = []
        this.isSmoothed = true
        this.lastSmoothChatMessageAddMs = null
        this.chatRateMs = 1000
        this.lastSmoothScrollUpdate = null
        this.scrollTimeRemainingMs = this.scrollPixelsRemaining = 0
        this.smoothScrollRafHandle = null
        this.preinsertHeight = 0
        this.maybeResizeScrollContainer()
        this.scrollToBottom()
      },

      handleMessageGroup(messageGroup) {
        if (messageGroup.length <= 0) {
          return
        }

        for (let message of messageGroup) {
          switch (message.type) {
          case constants.MESSAGE_TYPE_TEXT:
          case constants.MESSAGE_TYPE_GIFT:
          case constants.MESSAGE_TYPE_MEMBER:
          case constants.MESSAGE_TYPE_SUPER_CHAT:
            this.handleAddMessage(message)
            break
          case constants.MESSAGE_TYPE_DEL:
            this.handleDelMessage(message)
            break
          case constants.MESSAGE_TYPE_UPDATE:
            this.handleUpdateMessage(message)
            break
          }
        }

        this.maybeResizeScrollContainer()
        this.flushMessagesBuffer()
        this.$nextTick(this.maybeScrollToBottom)
      },
      handleAddMessage(message) {
        let isMerged = false
        if (message.type === constants.MESSAGE_TYPE_GIFT) {
          if (this.mergeSimilarGift(message.authorName, message.price, message.totalFreeCoin, message.giftName, message.num)) {
            isMerged = true
          }
        }

        // 添加一个本地时间给Ticker用，防止本地时间和服务器时间相差很大的情况
        message.addTime = new Date()

        // 【修改】只有当是 SuperChat 时才加入顶部栏数组
        if (message.type === constants.MESSAGE_TYPE_SUPER_CHAT) {
          this.paidMessages.unshift(_.cloneDeep(message))
          const MAX_PAID_MESSAGE_NUM = 100
          if (this.paidMessages.length > MAX_PAID_MESSAGE_NUM) {
            this.paidMessages.splice(MAX_PAID_MESSAGE_NUM, this.paidMessages.length - MAX_PAID_MESSAGE_NUM)
          }
        }

        if (!isMerged) {
          // 不知道cloneDeep拷贝Vue的响应式对象会不会有问题，保险起见把这句放在后面
          this.messagesBuffer.push(message)
        }
      },
      handleDelMessage({ id }) {
        let arrs = [this.messages, this.paidMessages, this.messagesBuffer]
        let needResetSmoothScroll = false
        for (let arr of arrs) {
          for (let i = 0; i < arr.length; i++) {
            if (arr[i].id !== id) {
              continue
            }
            arr.splice(i, 1)
            if (arr === this.messages) {
              needResetSmoothScroll = true
            }
            break
          }
        }
        if (needResetSmoothScroll) {
          this.resetSmoothScroll()
        }
      },
      handleUpdateMessage({ id, newValuesObj }) {
        let arrs = [this.messages, this.paidMessages, this.messagesBuffer]
        let needResetSmoothScroll = false
        for (let arr of arrs) {
          for (let message of arr) {
            if (message.id !== id) {
              continue
            }
            this.doUpdateMessage(message, newValuesObj)
            if (arr === this.messages) {
              needResetSmoothScroll = true
            }
            break
          }
        }
        if (needResetSmoothScroll) {
          this.resetSmoothScroll()
        }
      },
      doUpdateMessage(message, newValuesObj) {
        for (let name in newValuesObj) {
          if (!name.startsWith('$')) {
            message[name] = newValuesObj[name]
          }
        }
      },

      async flushMessagesBuffer() {
        if (this.messagesBuffer.length <= 0) {
          return
        }

        let removeNum = Math.max(this.messages.length + this.messagesBuffer.length - this.maxNumber, 0)
        if (removeNum > 0) {
          this.messages.splice(0, removeNum)
          // 防止同时添加和删除项目时所有的项目重新渲染 https://github.com/vuejs/vue/issues/6857
          await this.$nextTick()
        }

        this.preinsertHeight = this.$refs.items.clientHeight
        for (let message of this.messagesBuffer) {
          this.messages.push(message)
        }
        this.messagesBuffer = []
        // 等items高度变化
        await this.$nextTick()
        this.showNewMessages()
      },
      showNewMessages() {
        let hasScrollBar = this.$refs.items.clientHeight > this.$refs.scroller.clientHeight
        this.$refs.itemOffset.style.height = `${this.$refs.items.clientHeight}px`
        if (!hasScrollBar) {
          return
        }

        // 计算剩余像素
        this.scrollPixelsRemaining += this.$refs.items.clientHeight - this.preinsertHeight
        this.scrollToBottom()

        // 计算是否平滑滚动、剩余时间
        if (!this.lastSmoothChatMessageAddMs) {
          this.lastSmoothChatMessageAddMs = performance.now()
        }
        let interval = performance.now() - this.lastSmoothChatMessageAddMs
        this.chatRateMs = (0.9 * this.chatRateMs) + (0.1 * interval)
        if (this.isSmoothed) {
          if (this.chatRateMs < 400) {
            this.isSmoothed = false
          }
        } else {
          if (this.chatRateMs > 450) {
            this.isSmoothed = true
          }
        }
        this.scrollTimeRemainingMs += this.isSmoothed ? CHAT_SMOOTH_ANIMATION_TIME_MS : 0

        if (!this.smoothScrollRafHandle) {
          this.smoothScrollRafHandle = window.requestAnimationFrame(this.smoothScroll)
        }
        this.lastSmoothChatMessageAddMs = performance.now()
      },
      smoothScroll(time) {
        if (!this.lastSmoothScrollUpdate) {
          // 第一帧
          this.lastSmoothScrollUpdate = time
          this.smoothScrollRafHandle = window.requestAnimationFrame(this.smoothScroll)
          return
        }

        let interval = time - this.lastSmoothScrollUpdate
        if (
          this.scrollPixelsRemaining <= 0 || this.scrollPixelsRemaining >= 400  // 已经滚动到底部或者离底部太远则结束
          || interval >= 1000 // 离上一帧时间太久，可能用户切换到其他网页
          || this.scrollTimeRemainingMs <= 0 // 时间已结束
        ) {
          this.resetSmoothScroll()
          return
        }

        let pixelsToScroll = interval / this.scrollTimeRemainingMs * this.scrollPixelsRemaining
        this.scrollPixelsRemaining -= pixelsToScroll
        if (this.scrollPixelsRemaining < 0) {
          this.scrollPixelsRemaining = 0
        }
        this.scrollTimeRemainingMs -= interval
        if (this.scrollTimeRemainingMs < 0) {
          this.scrollTimeRemainingMs = 0
        }
        this.lastSmoothScrollUpdate = time
        this.smoothScrollRafHandle = window.requestAnimationFrame(this.smoothScroll)
      },
      resetSmoothScroll() {
        this.scrollTimeRemainingMs = this.scrollPixelsRemaining = 0
        this.lastSmoothScrollUpdate = null
        if (this.smoothScrollRafHandle) {
          window.cancelAnimationFrame(this.smoothScrollRafHandle)
          this.smoothScrollRafHandle = null
        }
      },

      maybeResizeScrollContainer() {
        this.$refs.itemOffset.style.height = `${this.$refs.items.clientHeight}px`
        this.$refs.itemOffset.style.minHeight = `${this.$refs.scroller.clientHeight}px`
        this.maybeScrollToBottom()
      },
      maybeScrollToBottom() {
        this.scrollToBottom()
      },
      scrollToBottom() {
        this.$refs.scroller.scrollTop = Math.pow(2, 24)
      },
    }
  }

  return exports
}))
