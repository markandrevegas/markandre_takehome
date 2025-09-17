<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue"

type Message = {
	id: string
	text?: string
	author?: string
	attributes?: {
		text?: string
		author?: string
	}
	conversationId?: string
}

defineProps<{
  token?: string | null
}>()

// --- Drawer ---
const drawerOpen = ref(false)
function toggleDrawer() {
	drawerOpen.value = !drawerOpen.value
}

// Show Input for New Message to active conversation
const showTextInput = ref(false)

// --- Reactive state ---
const username = ref("")
const loggedInUser = computed(() => username.value || localStorage.getItem("username") || "Guest")
const password = ref("")
const isLoading = ref(false)
const error = ref<string | null>(null)
const token = ref<string | null>(null)
const sending = ref(false)

// messages
const messageContent = ref("")
const firstConversation = ref<any | null>(null)
const allConversationsFromUser = ref<any[]>([])
const currentMessages = ref<Message[]>([])
const currentConversationName = ref("")

// conversations
const activeConversationId = ref<string | null>(null)

// --- Connect to WebSocket server ---
let ws: WebSocket | null = null

function connectWebSocket(conversationId: string, authToken: string) {
	// Close previous socket if already open
	if (ws) {
		ws.close()
		ws = null
	}

	ws = new WebSocket(`ws://localhost:9293/cable?conversationId=${conversationId}&token=${authToken}`)

	ws.onopen = () => {
		console.log("WebSocket connected")
	}

	ws.onerror = (err) => {
		console.error("WebSocket error:", err)
	}
	ws.onmessage = (event) => {
		try {
			const message = JSON.parse(event.data)
			// Log everything to see what comes in
			console.log("WS message received:", message)

			if (message.event === "message.created") {
				const raw = message.data
				const newMsg: Message = raw.attributes
					? raw
					: {
							...raw,
							type: "messages",
							attributes: {
								text: raw.text,
								author: raw.author,
							},
						}
				// Push directly into the currentMessages array
				currentMessages.value.push(newMsg)
				// Wait for the DOM to update before scrolling
				nextTick(() => {
					scrollToBottom()
				})
			}
		} catch (e) {
			console.warn("⚠️ Invalid WS message:", event.data)
		}
	}

	ws.onclose = () => {
		console.log("❌ WebSocket disconnected")
	}
}

async function openConversation(id: string) {
	try {
		activeConversationId.value = id
		drawerOpen.value = false

		const convo = allConversationsFromUser.value.find((c) => c.id === id)
		if (convo && convo.attributes) {
			currentConversationName.value = convo.attributes.name || ""
			currentMessages.value = convo.attributes.messages || []
		} else {
			currentConversationName.value = ""
			currentMessages.value = []
		}

		// Connect the websocket for live updates
		if (token.value) {
			connectWebSocket(id, token.value)
		}
	} catch (error) {
		console.error("Failed to open conversation:", error)
		currentConversationName.value = ""
		currentMessages.value = []
	}
}
// --- Send a new message to active conversation
const handleSendMessage = async () => {
	if (!activeConversationId.value || !messageContent.value.trim() || !token.value) return

	sending.value = true
	const textToSend = messageContent.value
	messageContent.value = ""
	scrollToBottom()

	try {
		const res = await fetch("/api/conversations/" + activeConversationId.value, {
			method: "POST",
			headers: {
				...(token.value ? { Authorization: token.value } : {}),
				Accept: "application/vnd.api+json",
				"Content-Type": "application/vnd.api+json",
			},
			body: JSON.stringify({
				data: {
					type: "messages",
					attributes: {
						text: textToSend,
					},
				},
			}),
		})

		if (!res.ok) throw new Error("Failed to post message")
	} catch (err) {
		console.error("Failed to send message:", err)
	} finally {
		sending.value = false
	}
}
const getMessageText = (msg: Message) => msg.attributes?.text || msg.text
const getMessageAuthor = (msg: Message) => msg.attributes?.author || msg.author
const getMessageClass = (msg: Message) => (getMessageAuthor(msg) === "AI" ? "bg-zinc-100 text-left text-abyssal" : "zinc-100 text-right text-abyssal")

function scrollToBottom() {
	nextTick(() => {
		const el = document.querySelector(".messageList")
		if (el) el.scrollTop = el.scrollHeight
	})
}

function resetConversation() {
	activeConversationId.value = null
	currentMessages.value = []
	currentConversationName.value = ""
	showTextInput.value = false
	if (ws) {
		ws.close()
		ws = null
	}
	drawerOpen.value = false
}

function autoResize(event: Event) {
	const textarea = event.target as HTMLTextAreaElement
	textarea.style.height = "auto"
	textarea.style.height = textarea.scrollHeight + "px"
}

// --- Fetch conversations ---
const fetchConversations = async () => {
	if (!token?.value) return

	try {
		const response = await fetch("/api/conversations", {
			method: "GET",
			headers: {
				Authorization: token.value,
				"Content-Type": "application/vnd.api+json",
				Accept: "application/vnd.api+json",
			},
		})

		if (!response.ok) throw new Error("HTTP error! status: " + response.status)

		const data = await response.json()
		const conversations = data.data.flatMap((conv: any) => conv.attributes.messages)

		allConversationsFromUser.value = data.data
		firstConversation.value = conversations[0] || null

		console.log(allConversationsFromUser.value)
		// 🔗 Connect to WebSocket after we know the conversationId
		if (firstConversation.value?.conversationId && token.value) {
			connectWebSocket(firstConversation.value.conversationId, token.value)
		}
	} catch (err) {
		console.error("Failed to fetch conversations:", err)
		allConversationsFromUser.value = []
		firstConversation.value = null
	}
}

// --- Start a new conversation ---
const handleStartConversation = async () => {
	console.log("Starting new conversation...")
	startNewConversation().then((newConvo) => {
		if (newConvo) {
			allConversationsFromUser.value.push(newConvo)
			activeConversationId.value = newConvo.id
			currentMessages.value = []
			showTextInput.value = true
			if (token.value) {
				connectWebSocket(newConvo.id, token.value)
			}
		}
	})
}
const startNewConversation = async () => {
	const body = {
		data: {
			attributes: {
				name: "New Chat",
			},
		},
	}

	try {
		const response = await fetch(`/api/conversations`, {
			method: "POST",
			headers: {
				Authorization: token.value || "",
				"Content-Type": "application/vnd.api+json",
				Accept: "application/vnd.api+json",
			},
			body: JSON.stringify(body),
		})

		if (!response.ok) throw new Error("HTTP error! status: " + response.status)
		const data = await response.json()
		console.log("New conversation started:", data)
		return data.data // → new message object
	} catch (err) {
		console.error("❌ Failed to start conversation:", err)
		return null
	}
}

// --- Login ---
const login = async () => {
	isLoading.value = true
	error.value = null

	try {
		const response = await fetch("/api/authenticate", {
			method: "POST",
			headers: {
				"Content-Type": "application/vnd.api+json",
				Accept: "application/vnd.api+json",
			},
			body: JSON.stringify({
				data: {
					type: "authentication",
					attributes: {
						username: username.value,
						password: password.value,
					},
				},
			}),
		})

		const data = await response.json()

		if (!response.ok) {
			error.value = data.errors?.[0]?.detail || "An unknown error occurred."
			token.value = null
			localStorage.removeItem("authToken")
			localStorage.removeItem("username")
		} else {
			token.value = data.meta.token
			if (token.value) {
				localStorage.setItem("authToken", token.value)
				localStorage.setItem("username", username.value)
				await fetchConversations()
			}
		}
	} catch (err) {
		error.value = "Failed to connect to the server."
		console.error(err)
	} finally {
		isLoading.value = false
	}
}

// --- Logout ---
const logout = () => {
	token.value = null
	username.value = ""
	password.value = ""
	messageContent.value = ""
	firstConversation.value = null
	allConversationsFromUser.value = []
	if (ws) {
		ws.close()
		ws = null
	}
	localStorage.removeItem("authToken")
	currentMessages.value = []
	currentConversationName.value = ""
	activeConversationId.value = null
}

// --- Load token from localStorage on mount ---
onMounted(() => {
	const saved = localStorage.getItem("authToken")
	if (saved) {
		token.value = saved
		fetchConversations()
		if (firstConversation.value?.conversationId) {
			connectWebSocket(firstConversation.value.conversationId, saved)
		}
	}
})

// --- Cleanup on unmount ---
onUnmounted(() => {
	if (ws) {
		ws.close()
		ws = null
	}
})
</script>
<template>
	<div class="container">
		<div v-if="!token" class="login-card">
			<span class="mx-auto block">
				<svg id="logo" data-testid="svg-logo" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="mx-auto h-8 w-8">
					<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
				</svg>
			</span>
			<h1 class="mb-8 text-center text-xl text-abyssal">Svar</h1>
			<form @submit.prevent="login" role="form" class="mx-auto flex w-5/6 flex-col gap-2">
				<div class="flex items-center justify-start border-b bg-zinc-100">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="mx-2 size-4">
						<path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
					</svg>

					<label for="username" class="block hidden text-sm font-medium text-gray-700">Username</label>
					<input id="username" type="text" v-model="username" />
				</div>
				<div class="flex items-center justify-start border-b bg-zinc-100">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="mx-2 size-4">
						<path fill-rule="evenodd" d="M14 6a4 4 0 0 1-4.899 3.899l-1.955 1.955a.5.5 0 0 1-.353.146H5v1.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2.293a.5.5 0 0 1 .146-.353l3.955-3.955A4 4 0 1 1 14 6Zm-4-2a.75.75 0 0 0 0 1.5.5.5 0 0 1 .5.5.75.75 0 0 0 1.5 0 2 2 0 0 0-2-2Z" clip-rule="evenodd" />
					</svg>

					<label for="password" class="block hidden text-sm font-medium text-gray-700">Password</label>
					<input id="password" type="password" v-model="password" />
				</div>
				<div class="mt-8 flex justify-center">
					<button type="submit" :disabled="isLoading">
						{{ isLoading ? "Logging in..." : "Get some" }}
					</button>
				</div>
			</form>

			<!-- Error message -->
			<div v-if="error" class="error-msg">
				<p>{{ error }}</p>
			</div>
		</div>

		<!-- Chat Interface -->
		<div v-else class="inbox">
			<div class="flex w-full items-center justify-between">
				<button type="button" class="menu-btn" @click="toggleDrawer">
					<svg v-if="!drawerOpen" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
					</svg>
					<svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
					</svg>
				</button>
				<span @click="resetConversation" class="duration-400 text-xs uppercase transition-colors hover:cursor-pointer hover:text-zinc-500">{{ loggedInUser }}</span>
				<button @click="logout" class="button-svg">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
						<path fill-rule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clip-rule="evenodd" />
						<path fill-rule="evenodd" d="M6 10a.75.75 0 0 1 .75-.75h9.546l-1.048-.943a.75.75 0 1 1 1.004-1.114l2.5 2.25a.75.75 0 0 1 0 1.114l-2.5 2.25a.75.75 0 1 1-1.004-1.114l1.048-.943H6.75A.75.75 0 0 1 6 10Z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>
			<div class="relative h-full w-full">
				<!-- Drawer -->
				<transition name="fade">
					<div v-if="drawerOpen" class="absolute inset-0 h-full overflow-y-scroll">
						<h3 class="mb-4 mt-8 text-sm font-medium">Conversations</h3>
						<ul class="flex flex-col gap-2">
							<li v-for="convo in allConversationsFromUser" :key="convo.id" class="li-style duration-400 cursor-pointer transition-colors" @click="openConversation(convo.id)">
								{{ convo.attributes?.name || "Unnamed conversation" }}
							</li>
						</ul>
					</div>
				</transition>
				<transition name="fade">
					<div class="main-content absolute inset-0" v-if="!drawerOpen">
						<div class="w-full flex-1">
							<!-- Conversation area -->
							<div class="flex flex-1 flex-col justify-center pt-8" :class="{ 'h-96 items-center': !activeConversationId }">
								<div v-if="activeConversationId">
									<!-- Header with conversation name -->
									<div class="py-2">
										<h2 class="text-base font-semibold text-gray-900">
											{{ currentConversationName || "Untitled Conversation" }}
										</h2>
									</div>
									<!-- Messages -->
									<div class="messageList">
										<div v-for="msg in currentMessages" :key="msg.id" :class="getMessageClass(msg)" class="p-2">
											<p v-if="msg.text">{{ msg.text }}</p>
											<p v-else>{{ msg.attributes?.text }}</p>
										</div>
									</div>
								</div>
								<div v-else class="flex flex-1 flex-col items-center justify-center">
									<button @click="handleStartConversation" class="button-svg">
										<svg role="button" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 duration-400 mt-8 transition-colors hover:text-zinc-500">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
									</button>

									<p role="button" @click="handleStartConversation" class="hidden duration-400 mt-8 transition-colors hover:text-zinc-500">Need an answer?</p>
								</div>
							</div>
						</div>
						<div v-if="activeConversationId" class="mt-auto grid w-full grid-cols-8 gap-2">
							<input @keyup.enter="handleSendMessage" :disabled="sending" type="text" v-model="messageContent" placeholder="Type your message..." class="col-span-7 w-full resize-none overflow-hidden rounded-md border border-gray-200 p-2 text-xs focus:border-gray-500 focus:ring-1 focus:ring-gray-500" rows="1" />
							<div class="flex justify-center">
								<button @click="handleSendMessage" :disabled="sending" class="button-svg flex w-max justify-center">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-4 w-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
									</svg>
								</button>
							</div>
						</div>
					</div>
				</transition>
			</div>
		</div>
	</div>
</template>
