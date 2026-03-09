document.querySelectorAll("*[editableImage]").forEach(elem=>{
	if(elem.hasAttribute("clickEventAdded")) return;
	elem.addEventListener('click',()=>{
		console.log(elem,elem.tagName)
		if(elem.tagName=="IMG") {
			elem.src = prompt("URL of image/icon:")
		}
		else {
			let source = prompt("URL of image/icon:")
			if(source)
				elem.style.backgroundImage = "url("+source+")"
		}
	})
	elem.setAttribute("clickEventAdded","true")
})

function generateArticleComponent(props) {
	return `
	<article class="container_e2a91b">
		<div> <!-- class="cardContainerWithoutTopIndicator_d7edfe">-->
			<div class="tierTrialIndicator__8b3dc tierTopIndicator__9397b" onclick="this.remove()">1 Week Free Trial<svg class="tierTrialIndicatorIcon_b1bda1" aria-label="Available to server members who have not yet received a free trial. Ask the server owner if Additional Benefits are included in this offer." aria-hidden="false" role="img" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M6 1C3.243 1 1 3.244 1 6c0 2.758 2.243 5 5 5s5-2.242 5-5c0-2.756-2.243-5-5-5zm0 2.376a.625.625 0 110 1.25.625.625 0 010-1.25zM7.5 8.5h-3v-1h1V6H5V5h1a.5.5 0 01.5.5v2h1v1z"></path></svg></div>
			<div class="tierInfoContainer__80b01">
				<h2 class="text-md-normal__4afad defaultColor__87d87 tierName_ba33cc" data-text-variant="text-md/normal" style="color: var(--interactive-active);" contenteditable>${props.name}</h2><img src="${props.icon}" alt="" class="tierImage__31b2d" editableImage>
				<div class="defaultColor__77578 heading-xl-semibold__18cc2 tierPrice__35e14" data-text-variant="heading-xl/semibold" contenteditable>$${props.price}</div>
				<div class="text-xs-normal__56c35 tierPeriod__90c6f" data-text-variant="text-xs/normal" style="color: var(--interactive-normal);">per month</div>
					`/* 
						<button type="button" disabled="" class="shinyButton_fc8363 button_d9762a button_afdfd9 lookFilled__19298 sizeMedium_c6fa98 fullWidth__7c3e8 grow__4c8a4">
						<div class="contents_fb6220">
						<div class="buttonContents__1c1c9"><svg class="icon__4fdf7" aria-hidden="true" role="img" width="16" height="16" viewBox="0 0 16 16">
								<path d="M14.3385 7.6721L10.4015 6.85189L11.891 4.56187C11.9309 4.49891 11.9482 4.42423 11.94 4.35013C11.9318 4.27603 11.8986 4.20692 11.8459 4.15421C11.7932 4.10149 11.7241 4.06829 11.65 4.06009C11.5759 4.05189 11.5012 4.0692 11.4382 4.10911L9.14822 5.59859L8.328 1.66158C8.328 1.57457 8.29345 1.49114 8.23193 1.42961C8.1704 1.36809 8.08693 1.3335 7.99992 1.3335C7.91291 1.3335 7.82944 1.36809 7.76791 1.42961C7.70639 1.49114 7.67183 1.57457 7.67183 1.66158L6.85162 5.59859L4.5616 4.10911C4.49863 4.0692 4.42395 4.05189 4.34985 4.06009C4.27576 4.06829 4.20665 4.10149 4.15393 4.15421C4.10122 4.20692 4.06802 4.27603 4.05982 4.35013C4.05162 4.42423 4.06892 4.49891 4.10884 4.56187L5.59836 6.85189L1.66134 7.6721C1.57432 7.6721 1.49086 7.70665 1.42933 7.76818C1.3678 7.8297 1.33325 7.91317 1.33325 8.00018C1.33325 8.0872 1.3678 8.17062 1.42933 8.23215C1.49086 8.29368 1.57432 8.32827 1.66134 8.32827L5.59836 9.14848L4.10884 11.4385C4.06803 11.5011 4.05031 11.5759 4.0587 11.6502C4.06708 11.7244 4.10104 11.7934 4.15477 11.8453C4.18407 11.8768 4.21963 11.9019 4.25918 11.9188C4.29874 11.9358 4.34139 11.9443 4.38442 11.9438C4.44713 11.9426 4.50835 11.9244 4.5616 11.8913L6.85162 10.4017L7.67183 14.3387C7.67183 14.4258 7.70639 14.5092 7.76791 14.5708C7.82944 14.6323 7.91291 14.6668 7.99992 14.6668C8.08693 14.6668 8.1704 14.6323 8.23193 14.5708C8.29345 14.5092 8.328 14.4258 8.328 14.3387L9.14822 10.4017L11.4382 11.8913C11.4915 11.9244 11.5527 11.9426 11.6154 11.9438C11.6585 11.9443 11.7011 11.9358 11.7407 11.9188C11.7802 11.9019 11.8158 11.8768 11.8451 11.8453C11.8988 11.7934 11.9328 11.7244 11.9411 11.6502C11.9495 11.5759 11.9318 11.5011 11.891 11.4385L10.4015 9.14848L14.3385 8.32827C14.4255 8.32827 14.509 8.29368 14.5705 8.23215C14.632 8.17062 14.6666 8.0872 14.6666 8.00018C14.6666 7.91317 14.632 7.8297 14.5705 7.76818C14.509 7.70665 14.4255 7.6721 14.3385 7.6721Z" fill="currentColor"></path>
							</svg>Subscribe</div>
					</button><span style="display: block; width: 1px; min-width: 1px; height: 16px; min-height: 16px;"></span>
					</div>
				<div class="text-sm-normal_e612c7 tierDescriptionTruncate__74686" data-text-variant="text-sm/normal" style="color: var(--text-normal);">
					<div contenteditable>${props.description}</div>
				</div>
				 */ + `
			</div>
			<div class="subscriptionPerks__2f4e5">
				<h2 class="text-xs-bold_c1eb0a defaultColor__87d87 sectionHeader_a844aa" data-text-variant="text-xs/bold" style="color: var(--header-secondary);">Member Color &amp; Badge</h2><span style="display: block; width: 1px; min-width: 1px; height: 8px; min-height: 8px;"></span>
							<div class="container_efbb97 roleMessagePreview__8088a">
								<div tabindex="-1" data-focus-blocked-7="-1">
									<div class="message__80c10 cozyMessage__64ce7 groupStart__56db5 wrapper__09ecc cozy_f5c119 zalgo__39311" role="article">
										<div class="contents_f41bb2"><img src="https://cdn.discordapp.com/avatars/898887736189153320/7636522a44d789de202bcb144284ad62.webp?size=80" aria-hidden="true" class="avatar__08316" alt=" "><img class="avatarDecoration__14b3c" src="https://cdn.discordapp.com/avatar-decoration-presets/a_b98e8b204d59882fb7f9f7c86922c0bf.png?size=96&amp;passthrough=false" alt=" " aria-hidden="true">
											<h3 class="header__39b23" aria-labelledby="message-username-0"><span id="message-username-0" class="headerText_f47574 hasRoleIcon_b0c680"><div class="username_d30d99 desaturateUserColors_b72bd3" role="button" tabindex="-1" style="color: ${props.color};" data-focus-blocked-7="0"  onclick="currentElement = this;colorInput.click()">Fox</div><img alt="" aria-label="Role icon, Supporter" class="roleIcon__59ca1 roleIcon_d491aa" height="20" src="${props.badge}" width="20" editableImage></span></h3>
											<div id="message-content-0" class="markup_a7e664 messageContent__21e69"><span>wow this looks so cool</span></div>
										</div>
									</div>
								</div>
							</div>
				`/* <div class="benefitsSection__0a92e">
					<h3 class="text-xs-bold_c1eb0a defaultColor__87d87 sectionHeader_a844aa" id="uid_2346" data-text-variant="text-xs/bold" style="color: var(--header-secondary);">Exclusive Channels</h3><span style="display: block; width: 1px; min-width: 1px; height: 12px; min-height: 12px;"></span>
					<ul class="benefitsList_a5c11d" aria-labelledby="uid_2346">
						<li>
							<div class="container_e337ba">
								<div class="infoContainer_f82778">
									<div class="text-md-medium__5151a name_b4c1cb" data-text-variant="text-md/medium" style="color: var(--header-primary);"><span class="hiddenVisually__06c3e">✧┆of-leak (text channel)</span>
										<div aria-hidden="true">#of-leak</div>
									</div>
									<div class="text-sm-normal_e612c7" data-text-variant="text-sm/normal" style="color: var(--interactive-normal);">Check the onlyfans leaks</div>
								</div>
							</div>
						</li>
					</ul>
				</div>
				<div class="benefitsSection__0a92e">
					<h3 class="text-xs-bold_c1eb0a defaultColor__87d87 sectionHeader_a844aa" id="uid_2347" data-text-variant="text-xs/bold" style="color: var(--header-secondary);">Additional Benefits</h3><span style="display: block; width: 1px; min-width: 1px; height: 12px; min-height: 12px;"></span>
					<ul class="benefitsList_a5c11d" aria-labelledby="uid_2347">
						<li>
							<div class="container_e337ba">
								<div class="infoContainer_f82778">
									<div class="text-md-medium__5151a name_b4c1cb" data-text-variant="text-md/medium" style="color: var(--header-primary);">Bonus</div>
									<div class="text-sm-normal_e612c7" data-text-variant="text-sm/normal" style="color: var(--interactive-normal);">Earn a bonus !</div>
								</div>
							</div>
						</li>
					</ul>
				</div> */ + `
				<div class="benefitsSection__0a92e">
					<h3 class="text-xs-bold_c1eb0a defaultColor__87d87 sectionHeader_a844aa" data-text-variant="text-xs/bold" style="color: var(--header-secondary);">Emojis</h3><span style="display: block; width: 1px; min-width: 1px; height: 12px; min-height: 12px;display:inline"></span>
					<span class="emojiList__2827c" style="display:inline">
							<img class="emojiListEmoji_c2cfdb" src="https://cdn.discordapp.com/emojis/1194255133308108890.png?size=24&amp;quality=lossless" width="24" height="24" alt="emoji81" editableImage oncontextmenu="event.preventDefault();if(confirm('Delete this emoji')) this.remove()">
							<img class="emojiListEmoji_c2cfdb" src="https://cdn.discordapp.com/emojis/921408529242423336.png?size=24&amp;quality=lossless" width="24" height="24" alt="emoji81" editableImage oncontextmenu="event.preventDefault();if(confirm('Delete this emoji')) this.remove()">
					</span>
					<button style="display:inline;position:relative;top:-2px" onclick="addEmoji(this)" aria-expanded="false" class="addButton_c648bf actionButton__81eaa role__631a3 rolePill_ee1aa1 rolePillBorder__00c58 disappearOnScreenShot" aria-label="Add role" type="button" role="listitem" data-list-item-id="roles-a665cebd-f76e-459e-98d6-ae2c83dd4fd8___overflow-add-roles-1115369521117659228" tabindex="-1"><svg class="addButtonIcon__6a05a" aria-hidden="true" role="img" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M20 11.1111H12.8889V4H11.1111V11.1111H4V12.8889H11.1111V20H12.8889V12.8889H20V11.1111Z"></path></svg></button><br>
					<input placeholder="Patreon checkout link..." class="disappearOnScreenShot stripeLink" style="color: var(--text-normal); background-color: var(--input-background);border-radius:4px;border:1px solid transparent" value="https://www.patreon.com/checkout/">
				</div>
			</div>
		</div>
	</article>
	`
}

function addEmoji(elem){
	let emojiId = prompt('Emoji ID:','')
	if(emojiId)
		elem.parentElement.querySelector(".emojiList__2827c").innerHTML += '<img class="emojiListEmoji_c2cfdb" src="https://cdn.discordapp.com/emojis/'+emojiId+'.png?size=24&amp;quality=lossless" width="24" height="24" editableImage oncontextmenu="event.preventDefault();if(confirm(\'Delete this emoji\')) this.remove()">'
}

colorInput.onchange = ()=>{
	console.log(currentElement)
	currentElement.style.color = colorInput.value
}

function setArticles(articles){
	document.getElementById("tierPreviews").innerHTML = ""
	for (props of articles) {
		document.getElementById("tierPreviews").innerHTML += generateArticleComponent(props)
	}
	
	document.getElementById("tierPreviews").querySelectorAll("*[editableImage]").forEach(elem=>{
		elem.onclick = ()=>{
			console.log(elem,elem.tagName)
			if(elem.tagName=="IMG") {
				elem.src = prompt("URL of image/icon:")
			}
			else {
				elem.style.backgroundImage = "url("+prompt("URL of image/icon:")+")"
			}
		}
	})
}

function setBannerIcon(url) {
	document.getElementById("serverIcon").style.backgroundImage = "url("+url+")"
}
function setBannerItself(url) {
	// document.getElementById("bannerItself").src = url
}
function setShopName(name) {
	document.getElementById("serverName").innerText = name
}
function setShopDescription(text) {
	document.getElementById("serverDescription").innerText = text
}

// let article = {
	// name: "Supporter",
	// price: 3.99,
	// icon: "https://cdn.discordapp.com/app-assets/1194200908758777926/store/1194213543080378420.webp?size=80",
	// badge: "https://cdn.discordapp.com/app-assets/1194200908758777926/store/1194213543080378420.webp?size=80",
	// description: "Join the Supporters! Subscribe now for exclusive chats to meet and mingle with other subscribers."
	// color: "rgb(142, 248, 255)",
// }
// setArticles(article)
// setBannerIcon("https://cdn.discordapp.com/icons/301993130159374356/dc52544a7abb9123e9257c84ac152e36.webp?size=64")
// setBannerItself("https://cdn.discordapp.com/icons/301993130159374356/dc52544a7abb9123e9257c84ac152e36.webp?size=64")
// setShopName("💖• Belle Delphine Community")
// setShopDescription("Enjoy some new perks with these subscriptions and products.")

setBannerIcon("wumpus_heart.png")
setBannerItself("server-banner-header-size.png")
setShopName("Dummy Server")
setShopDescription("This is a dummy description.")

let articles = [
	{
		name: "Dummy 1",
		price: 0.99,
		icon: "crash_test_dummy.png",
		badge: "https://cdn.discordapp.com/app-assets/1194200908758777926/store/1194213543080378420.webp?size=80",
		description: "This is a test subscription",
		color: "red",
	},{
		name: "Dummy 2",
		price: 2.99,
		icon: "crash_test_dummy.png",
		badge: "https://cdn.discordapp.com/app-assets/1194200908758777926/store/1194213543080378420.webp?size=80",
		description: "This is another test subscription",
		color: "cyan",
	},
]
setArticles(articles)


function create(){
	const props = {
		name: "Name",
		price: 0.99,
		icon: "crash_test_dummy.png",
		badge: "https://cdn.discordapp.com/app-assets/1194200908758777926/store/1194213543080378420.webp?size=80",
		description: "Description",
		color: "red",
	}
	document.getElementById("tierPreviews").innerHTML += generateArticleComponent(props)
	
	document.getElementById("tierPreviews").querySelectorAll("*[editableImage]").forEach(elem=>{
		elem.onclick = ()=>{
			console.log(elem,elem.tagName)
			if(elem.tagName=="IMG") {
				elem.src = prompt("URL of image/icon:")
			}
			else {
				elem.style.backgroundImage = "url("+prompt("URL of image/icon:")+")"
			}
		}
	})
}

function deleteLast(){
	let articles = [...document.querySelectorAll("article")]
	articles[articles.length - 1].remove()
}

async function exportTiers(i) {
	return await html2canvas(document.querySelector("#tierPreviews").querySelectorAll("article")[i],{allowTaint:true,useCORS:true,backgroundColor:null,scale:2})/*.then(canvas => {
		document.body.appendChild(canvas)
		document.querySelectorAll(".disappearOnScreenShot").forEach(elem=>elem.style.display="inline")
	});	*/
}


async function exportAllTiers() {
	return await html2canvas(document.querySelector("#tierPreviews"),{allowTaint:true,useCORS:true,backgroundColor:null,scale:2})/* .then(canvas => {
		document.body.appendChild(canvas)
		document.querySelectorAll(".disappearOnScreenShot").forEach(elem=>elem.style.display="inline")
	});	 */
}

async function exportBanner() {
	return await html2canvas(document.querySelector(".infoContainer__1d44f > div"),{allowTaint:true,useCORS:true,backgroundColor:null,scale:2})/* .then(canvas => {
		document.body.appendChild(canvas)
	}); */
}

async function sendMessage(step=0) {
	const billingMessage = "Buy my shit"
	//if(step>=3) return;
	/*if(step==2) {
		const formData = new FormData();
        	formData.append('username', 'Server Subscriptions');
	        formData.append('avatar_url', 'https://cdn3.emoji.gg/emojis/2166-server-subscriptions.png');
	        formData.append('content', billingMessage);

        	// Send the POST request to the Discord webhook
	        fetch(webhookUrl, {
	          method: 'POST',
	          body: formData
	        })
	          .then(response => response.json())
	          .then(data => console.log(data))
	          .catch(error => console.error('Error:', error));

		return
	}*/
	// Replace 'YOUR_WEBHOOK_URL' with the actual URL of your Discord webhook
	const webhookUrl = document.querySelector(".inputDefault__80165").value
	console.log("URL Webhook:",webhookUrl)
	
	document.querySelectorAll(".disappearOnScreenShot").forEach(elem=>elem.style.display="none")
	const banner = !step ? await exportBanner() : ""
	const tiers = step > 0 ? await exportTiers(step-1) : ""
	document.querySelectorAll(".disappearOnScreenShot").forEach(elem=>elem.style.display="inline")

	const base64DataUrl = step?tiers.toDataURL():banner.toDataURL();

	// Convert base64 data URL to Blob
	const base64String = base64DataUrl.split(',')[1];
	const blob = atob(base64String);
	const arrayBuffer = new ArrayBuffer(blob.length);
	const byteArray = new Uint8Array(arrayBuffer);
	for (let i = 0; i < blob.length; i++) {
	  byteArray[i] = blob.charCodeAt(i);
	}
	const file = new Blob([arrayBuffer], { type: 'image/png' });
	i = step-1
	// Create a FormData object to append the file
	const formData = new FormData();
	formData.append('username', 'Server Subscriptions');
	formData.append('avatar_url', 'https://cdn3.emoji.gg/emojis/2166-server-subscriptions.png');
	let message;
	formData.append('content', !step?"":'[[Buy '+document.querySelector("#tierPreviews").querySelectorAll("article")[i].querySelector("h2").innerText+']](<'+document.querySelector("#tierPreviews").querySelectorAll("article")[i].querySelector(".stripeLink").value+'>)');
	formData.append('file', file, 'image.png');

	// Send the POST request to the Discord webhook
	await fetch(webhookUrl, {
	  method: 'POST',
	  body: formData
	})
	  .then(response => response.json())
	  .catch(error => console.error('Error:', error));
	if(step==0 || step<[...document.querySelectorAll("article")].length) {
		sendMessage(step+1)
	}
}
