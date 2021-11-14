// ==UserScript==
// @name        Gaysir Forum Block
// @author   Enitoni
// @description A userscript that lets you hide or fade out posts from certain users on the Gaysir forum
// @version     1.3
// @match       https://www.gaysir.no/*
// @icon        https://www.google.com/s2/favicons?domain=gaysir.no
// @copyright   2021+, Enitoni
// @license     MIT; http://opensource.org/licenses/MIT
// @run-at document-body
// @grant GM_setValue
// @grant GM_getValue
// ==/UserScript==

type User = {
    id: string
    name: string
}

type PostInformation = {
    author: User
    hasQuotes: boolean
}

type Blockage = {
    type: "fade" | "block"
    user: User
}

let blocklist: Blockage[] = []

const getBlockage = (user: User) =>
    blocklist.find((x) => {
        // The user has blocked you or is blocked by you on Gaysir itself
        if (x.user.id === "0") {
            return x.user.name === user.name
        }

        return x.user.id === user.id
    })

const POLLING_RATE = 16
const DEFAULT_PROFILE_PIC_URL = "/img/nopic/nopic_bh_min.png"

const BLOCKED_USERNAME = "Blocked"
const BLOCKED_CONTENT =
    "The content has been removed because you blocked this user."

// Creates a listener that callbacks when the page changes
function createPageListener(callback: (page: string) => void) {
    let currentLocation = location.hash

    const poll = () => {
        if (location.hash !== currentLocation) {
            currentLocation = location.hash
            callback(location.hash.slice(2))
        }

        setTimeout(poll, POLLING_RATE)
    }

    poll()
    callback(currentLocation)
}

// Creates a listener that callbacks when a forum page changes/appears with the relevant posts
function createForumPageListener(
    callback: (elements: HTMLDivElement[]) => void
) {
    let timeout: number

    const pollForPosts = () => {
        const list =
            document.querySelectorAll<HTMLDivElement>(".innlegg_wrapper")

        if (list.length === 0) {
            timeout = setTimeout(pollForPosts, POLLING_RATE)
            return
        }

        callback([...list])
    }

    const onChange = (page: string) => {
        clearTimeout(timeout)

        const isThreadPage = /forum\/traad\/[\d]/g.test(page)
        if (!isThreadPage) return

        pollForPosts()
    }

    createPageListener(onChange)
}

/**
 * Forum post logic
 */

function getPostInformation(element: HTMLDivElement): PostInformation {
    const author = element.querySelector<HTMLAnchorElement>(".profil")

    const name =
        author?.innerText ??
        element.querySelector<HTMLSpanElement>(".profil_deaktivert")
            ?.innerText ??
        "Unknown"

    const [id] = author?.href.match(/([\d])+$/g)! ?? "0"

    const hasQuotes = !!element.querySelector("blockquote")

    return {
        author: { id, name },
        hasQuotes,
    }
}

function createBlockButton(user: User) {
    const anchor = document.createElement("a")
    anchor.className = "replyline_button"
    anchor.href = ""

    anchor.style.background = "transparent"
    anchor.style.height = "inherit"
    anchor.style.lineHeight = "inherit"

    const icon = document.createElement("i")
    icon.innerText = "block"
    icon.className = "material-icons"
    icon.setAttribute("aria-hidden", "true")

    anchor.append(icon)

    anchor.addEventListener("click", (e) => {
        e.preventDefault()
        openModal(user)
    })

    return anchor
}

// Fades the post content and removes pointer events
function fadePost(element: HTMLDivElement) {
    const content = element.querySelector<HTMLDivElement>(".innlegg_content")!
    content.style.opacity = "0.3"
}

// Blocks the post content by removing text and profile information
function blockPost(element: HTMLDivElement) {
    const image = element.querySelector<HTMLAnchorElement>(".userimg_list")!
    image.style.backgroundImage = `url(${DEFAULT_PROFILE_PIC_URL})`

    const link = (element.querySelector<HTMLAnchorElement>(".profil") ||
        element.querySelector<HTMLSpanElement>(".profil_deaktivert"))!
    link.innerText = BLOCKED_USERNAME

    const content = element.querySelector<HTMLDivElement>(".innlegg_comment")!
    content.innerHTML = `<em>${BLOCKED_CONTENT}</em>`

    element.querySelector(".userinfo_list span")!.remove()
}

function removePostButtons(element: HTMLDivElement) {
    element.querySelectorAll(".replyline_button").forEach((el) => {
        const icon = el.querySelector<HTMLDivElement>("i")

        if (!["block"].includes(icon?.innerText ?? "")) {
            el.remove()
        }
    })
}

function processQuotes(element: HTMLQuoteElement) {
    const match = element.innerText.match(/^(.+) skrev/)
    if (!match) return

    const [_, user] = match
    const blockage = blocklist.find((x) => x.user.name === user)

    if (blockage && blockage.type === "block") {
        element.innerHTML = `<em>${BLOCKED_CONTENT}</em>`
    }
}

function processPost(element: HTMLDivElement) {
    // Prevent an already modified post from being modified again
    if (element.getAttribute("data-gfb")) return

    const info = getPostInformation(element)

    const isModPost = !!element.querySelector(".mod_comment")
    if (isModPost) return

    // Add the block button
    const line = element.querySelector(".innlegg_replyline")

    if (line) {
        line.insertBefore(createBlockButton(info.author), line.childNodes[5])
    }

    // Perform the block
    const blockage = getBlockage(info.author)

    if (blockage) {
        if (blockage.type == "fade") {
            fadePost(element)
        } else {
            blockPost(element)
        }

        removePostButtons(element)
    }

    element.querySelectorAll("blockquote").forEach((e) => processQuotes(e))
    element.setAttribute("data-gfb", "true")
}

/**
 * Modal logic
 */

type Option = {
    value: string
    label: string
}

function createRadioInput(name: string, value: string, options: Option[]) {
    const container = document.createElement("div")
    container.className = "radios"
    container.style.textAlign = "left"
    container.style.display = "inline-block"

    const innerContainer = document.createElement("p")

    for (const [i, option] of options.entries()) {
        const label = document.createElement("label")
        label.className = "control control--radio styler_cbl"
        label.innerText = option.label
        label.style.display = "block"

        const input = document.createElement("input")
        input.type = "radio"
        input.name = name
        input.value = option.value
        input.checked = option.value === value

        const checkIndicator = document.createElement("div")
        checkIndicator.className = "control__indicator"

        label.append(input, checkIndicator)
        innerContainer.append(label)
    }

    container.append(innerContainer)

    return [
        container,
        () =>
            document.querySelector<HTMLInputElement>(
                `input[name="${name}"]:checked`
            )!.value,
    ] as const
}

function openModal(user: User) {
    const container = document.createElement("div")
    container.className = "lightbox_content"

    const innerContainer = document.createElement("div")
    innerContainer.className = "lightbox_img_txt"

    // Header
    const header = document.createElement("div")
    header.className = "lightbox_header"

    // Close button
    const closeButton = document.createElement("a")
    closeButton.className = "close close_x"
    closeButton.href = ""

    closeButton.addEventListener("click", (e) => {
        e.preventDefault()
        container.remove()
    })

    const closeIcon = document.createElement("i")
    closeIcon.className = "material-icons"
    closeIcon.innerText = "close"

    closeButton.append(closeIcon)

    // Header title
    const headerTitle = document.createElement("h3")
    headerTitle.className = "title_lbg"
    headerTitle.innerText = "Gaysir Forum Block"

    header.append(closeButton, headerTitle)

    // Content
    const content = document.createElement("div")
    content.className = "lightbox_tekstboks"

    const innerContent = document.createElement("div")
    innerContent.className = "lightbox_contentbox padd_lrb center"

    const title = document.createElement("h1")
    title.innerText = `Block ${user.name}`

    const text = document.createElement("p")
    text.innerText =
        "Select an option above to change the block mode for this user. The changes will only show up after a refresh or page change."

    // Options
    const blockage = getBlockage(user)

    const [input, getValue] = createRadioInput(
        "block-mode",
        blockage?.type ?? "none",
        [
            {
                value: "none",
                label: "Don't block",
            },
            {
                value: "fade",
                label: "Fade, this will fade out posts from the user.",
            },
            {
                value: "block",
                label: "Block, this will remove the post and user content completely.",
            },
        ]
    )

    // Button
    const button = document.createElement("input")
    button.className = "styler_button memberformsubmit"
    button.value = "Save"

    button.addEventListener("click", (e) => {
        e.preventDefault()

        setBlockMode(getValue() as any, user)
        container.remove()
    })

    innerContent.append(title, input, text, button)
    content.append(innerContent)

    innerContainer.append(header, content)
    container.append(innerContainer)

    document.getElementById("app")?.append(container)
}

/**
 * Data persistence logic
 */

declare var GM_getValue: (name: string) => string
declare var GM_setValue: (name: string, value: string) => void

function loadBlocklist() {
    try {
        const string = GM_getValue("blocklist")
        const parsed = JSON.parse(string)
        blocklist = parsed
    } catch {}
}

function setBlockMode(mode: Blockage["type"] | "none", user: User) {
    blocklist = blocklist.filter((x) => {
        if (x.user.id === "0") {
            return x.user.name !== user.name
        }

        return x.user.id !== user.id
    })

    if (mode !== "none") {
        blocklist.push({ type: mode, user })
    }

    GM_setValue("blocklist", JSON.stringify(blocklist))
}

function main() {
    loadBlocklist()

    createForumPageListener((elements) => elements.forEach(processPost))
}

main()
