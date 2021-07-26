"use strict";
// ==UserScript==
// @name        Gaysir Forum Block
// @author   Enitoni
// @description A userscript that lets you hide or fade out posts from certain users on the Gaysir forum
// @version     1.1
// @match       https://www.gaysir.no/*
// @icon        https://www.google.com/s2/favicons?domain=gaysir.no
// @copyright   2021+, Enitoni
// @license     MIT; http://opensource.org/licenses/MIT
// @run-at document-body
// @grant GM_setValue
// @grant GM_getValue
// ==/UserScript==
let blocklist = [];
const POLLING_RATE = 16;
const DEFAULT_PROFILE_PIC_URL = "/img/nopic/nopic_bh_min.png";
const BLOCKED_USERNAME = "Blocked";
const BLOCKED_CONTENT = "The content has been removed because you blocked this user.";
// Creates a listener that callbacks when the page changes
function createPageListener(callback) {
    let currentLocation = location.hash;
    const poll = () => {
        if (location.hash !== currentLocation) {
            currentLocation = location.hash;
            callback(location.hash.slice(2));
        }
        setTimeout(poll, POLLING_RATE);
    };
    poll();
    callback(currentLocation);
}
// Creates a listener that callbacks when a forum page changes/appears with the relevant posts
function createForumPageListener(callback) {
    let timeout;
    const pollForPosts = () => {
        const list = document.querySelectorAll(".innlegg_wrapper");
        if (list.length === 0) {
            timeout = setTimeout(pollForPosts, POLLING_RATE);
            return;
        }
        callback([...list]);
    };
    const onChange = (page) => {
        clearTimeout(timeout);
        const isThreadPage = /forum\/traad\/[\d]/g.test(page);
        if (!isThreadPage)
            return;
        pollForPosts();
    };
    createPageListener(onChange);
}
/**
 * Forum post logic
 */
function getPostInformation(element) {
    var _a, _b;
    const author = element.querySelector(".profil");
    const name = (_a = author === null || author === void 0 ? void 0 : author.innerText) !== null && _a !== void 0 ? _a : "Blocked";
    const [id] = (_b = author === null || author === void 0 ? void 0 : author.href.match(/([\d])+$/g)) !== null && _b !== void 0 ? _b : "0";
    const hasQuotes = !!element.querySelector("blockquote");
    return {
        author: { id, name },
        hasQuotes,
    };
}
function createBlockButton(user) {
    const anchor = document.createElement("a");
    anchor.className = "replyline_button";
    anchor.href = "";
    const icon = document.createElement("i");
    icon.innerText = "block";
    icon.className = "material-icons";
    icon.setAttribute("aria-hidden", "true");
    anchor.append(icon);
    anchor.addEventListener("click", (e) => {
        e.preventDefault();
        openModal(user);
    });
    return anchor;
}
// Fades the post content and removes pointer events
function fadePost(element) {
    const content = element.querySelector(".innlegg_content");
    content.style.opacity = "0.3";
    content.style.pointerEvents = "none";
}
// Blocks the post content by removing text and profile information
function blockPost(element) {
    const image = element.querySelector(".userimg_list");
    image.style.backgroundImage = `url(${DEFAULT_PROFILE_PIC_URL})`;
    const link = element.querySelector(".profil");
    link.innerText = BLOCKED_USERNAME;
    const content = element.querySelector(".innlegg_comment");
    content.innerHTML = `<em>${BLOCKED_CONTENT}</em>`;
    element.querySelector(".userinfo_list span").remove();
}
function removePostButtons(element) {
    element.querySelectorAll(".replyline_button").forEach((el) => {
        var _a;
        const icon = el.querySelector("i");
        if (["reply", "format_quote"].includes((_a = icon === null || icon === void 0 ? void 0 : icon.innerText) !== null && _a !== void 0 ? _a : "")) {
            el.remove();
        }
    });
}
function processQuotes(element) {
    const match = element.innerText.match(/^(.+) skrev/);
    if (!match)
        return;
    const [_, user] = match;
    const blockage = blocklist.find((x) => x.user.name === user);
    if (blockage && blockage.type === "block") {
        element.innerHTML = `<em>${BLOCKED_CONTENT}</em>`;
    }
}
function processPost(element) {
    // Prevent an already modified post from being modified again
    if (element.getAttribute("data-gfb"))
        return;
    const info = getPostInformation(element);
    const isModPost = !!element.querySelector(".mod_comment");
    if (isModPost)
        return;
    // Add the block button
    const line = element.querySelector(".innlegg_replyline");
    if (info.author.id !== "0" && line) {
        line.insertBefore(createBlockButton(info.author), line.childNodes[5]);
    }
    // Perform the block
    const blockage = blocklist.find((x) => x.user.id === info.author.id);
    if (blockage) {
        if (blockage.type == "fade") {
            fadePost(element);
        }
        else {
            blockPost(element);
        }
        removePostButtons(element);
    }
    element.querySelectorAll("blockquote").forEach((e) => processQuotes(e));
    element.setAttribute("data-gfb", "true");
}
function createRadioInput(name, value, options) {
    const container = document.createElement("div");
    container.className = "radios";
    container.style.textAlign = "left";
    container.style.display = "inline-block";
    const innerContainer = document.createElement("p");
    for (const [i, option] of options.entries()) {
        const label = document.createElement("label");
        label.className = "control control--radio styler_cbl";
        label.innerText = option.label;
        label.style.display = "block";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = name;
        input.value = option.value;
        input.checked = option.value === value;
        const checkIndicator = document.createElement("div");
        checkIndicator.className = "control__indicator";
        label.append(input, checkIndicator);
        innerContainer.append(label);
    }
    container.append(innerContainer);
    return [
        container,
        () => document.querySelector(`input[name="${name}"]:checked`).value,
    ];
}
function openModal(user) {
    var _a, _b;
    const container = document.createElement("div");
    container.className = "lightbox_content";
    const innerContainer = document.createElement("div");
    innerContainer.className = "lightbox_img_txt";
    // Header
    const header = document.createElement("div");
    header.className = "lightbox_header";
    // Close button
    const closeButton = document.createElement("a");
    closeButton.className = "close close_x";
    closeButton.href = "";
    closeButton.addEventListener("click", (e) => {
        e.preventDefault();
        container.remove();
    });
    const closeIcon = document.createElement("i");
    closeIcon.className = "material-icons";
    closeIcon.innerText = "close";
    closeButton.append(closeIcon);
    // Header title
    const headerTitle = document.createElement("h3");
    headerTitle.className = "title_lbg";
    headerTitle.innerText = "Gaysir Forum Block";
    header.append(closeButton, headerTitle);
    // Content
    const content = document.createElement("div");
    content.className = "lightbox_tekstboks";
    const innerContent = document.createElement("div");
    innerContent.className = "lightbox_contentbox padd_lrb center";
    const title = document.createElement("h1");
    title.innerText = `Block ${user.name}`;
    const text = document.createElement("p");
    text.innerText =
        "Select an option above to change the block mode for this user. The changes will only show up after a refresh or page change.";
    // Options
    const blockage = blocklist.find((x) => x.user.id === user.id);
    const [input, getValue] = createRadioInput("block-mode", (_a = blockage === null || blockage === void 0 ? void 0 : blockage.type) !== null && _a !== void 0 ? _a : "none", [
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
    ]);
    // Button
    const button = document.createElement("input");
    button.className = "styler_button memberformsubmit";
    button.value = "Save";
    button.addEventListener("click", (e) => {
        e.preventDefault();
        setBlockMode(getValue(), user);
        container.remove();
    });
    innerContent.append(title, input, text, button);
    content.append(innerContent);
    innerContainer.append(header, content);
    container.append(innerContainer);
    (_b = document.getElementById("app")) === null || _b === void 0 ? void 0 : _b.append(container);
}
function loadBlocklist() {
    try {
        const string = GM_getValue("blocklist");
        const parsed = JSON.parse(string);
        blocklist = parsed;
    }
    catch (_a) { }
}
function setBlockMode(mode, user) {
    blocklist = blocklist.filter((x) => x.user.id !== user.id);
    if (mode !== "none") {
        blocklist.push({ type: mode, user });
    }
    GM_setValue("blocklist", JSON.stringify(blocklist));
}
function main() {
    loadBlocklist();
    createForumPageListener((elements) => elements.forEach(processPost));
}
main();
