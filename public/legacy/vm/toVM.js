// if(!localStorage.setting)
console.log("Converting to VM interface")
if(!localStorage.setting) {
	localStorage.setItem("setting",JSON.stringify({"system":{"power":{"saver":{"state":true},"battery":-99},"display":{"brightness":25,"nightlight":{"state":false},"connect":false}},"person":{"name":"Fox3000foxy","theme":"dark","color":"blue"},"devices":{"bluetooth":true},"network":{"wifi":{"state":true},"airplane":false},"privacy":{"location":{"state":false}}}))
	localStorage.locked = false
	localStorage.closeAbout = true
	localStorage.wps = 999
	localStorage.installed = JSON.stringify([
		{"name":"Otaku Companion","icon":"https://stella.jsannier.fr/otakucompanion/assets/icons/icon.png","type":"app","data":{"type":"IFrame","url":"https://stella.jsannier.fr/otakucompanion","invert":true,"gallery":[],"desc":"Visual Studio Code is a free, lightweight, and extensible code editor for building web, desktop, and mobile applications, using any programming language and framework.\nVisual Studio Code has built-in support for Git source control management and powerful integrations with GitHub, an integrated debugger, and smart code completion with IntelliSense and with Al-driven IntelliCode. With over 30,000 extensions and themes in the Visual Studio Code Marketplace, you can customize the features and the look of Visual Studio Code to fit your needs, preferences, and style.\nYou can use Visual Studio Code to build any kind of app, for web, desktop, and mobile. Visual Studio Code supports JavaScript and TypeScript natively and offers extensions for coding in languages such as Python, Java, C/C++, C#, Go, Rust, PHP, and many more.","feat":"Fast, Powerful Editing-Linting, multi-cursor editing, parameter hints, and other powerful editing features.\nOver 30,000 extensions, and growing - Enable additional languages, themes, debuggers, commands, and more. VS Code's growing community shares their secret sauce to improve your workflow.\nBuild any app type, using any programming language and framework, including JavaScript and TypeScript, Python, Java, C/C++, C#, Go, Rust, PHP, and many more, as well as many popular technologies.\nSupport for notebooks including Jupyter, for data science and Al development.\nBuilt-in support for Git source control management and integrations with GitHub for managing issues and pull requests.\nIntelligent Code Completion - IntelliSense and Al-driven IntelliCode offer completions for variables, methods, and imported modules.\nRich Debugging-Print debugging is a thing of the past. Use debugging tools directly in VS Code.\nWrite code from anywhere with the Visual Studio Code Remote extensions and support for GitHub Codespaces."},"pwa":true},
		{"name":"osu!","icon":"https://joshua-usi.github.io/osw/src/images/osw.png","type":"app","data":{"type":"IFrame","url":"https://joshua-usi.github.io/osw/","gallery":["https://joshua-usi.github.io/osw/src/images/osw-background.png"],"desc":"osu!, is a fun free-to-play rhythm game, you have to upload your own beatmaps","feat":"fun game with alot of beatmaps"},"pwa":true},
		{"name":"Stick Ninja","icon":"https://github.com/RedEdge967/stick-ninja/raw/master/logo.png","type":"app","data":{"type":"IFrame","url":"https://rededge967.github.io/stick-ninja/","gallery":["https://user-images.githubusercontent.com/91379432/155825068-defa9420-344c-4d88-bae4-0962b039af8a.mp4"],"desc":"A simple game to have some fun in the boring time","feat":"A simple canvas ninja game written in html5, css3 and javascript to have some fun in the boring time which can run online same as offline also."},"pwa":true},
		{"name":"Super Mario Bros.","icon":"https://icons.iconarchive.com/icons/ph03nyx/super-mario/128/Retro-Mario-icon.png","type":"app","data":{"type":"IFrame","url":"https://supermario-game.com/mario-game/mario.html","gallery":["https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Mario_Series_Logo.svg/1200px-Mario_Series_Logo.svg.png","https://cdn.vox-cdn.com/thumbor/q86cfIgaaRxt7n5UG2iQEGx4Gls=/0x84:1024x767/1400x1050/filters:focal(0x84:1024x767):format(png)/cdn.vox-cdn.com/uploads/chorus_image/image/47185140/OZJlR3q.0.0.png","https://i.ytimg.com/vi/cWOkHQXw0JQ/maxresdefault.jpg","https://cdn.wionews.com/sites/default/files/styles/story_page/public/2020/10/02/162864-mario.jpg"],"desc":" Italian plumber Mario and his twin brother Luigi exterminate creatures emerging from the sewers by knocking them upside-down and kicking them away","feat":"Mario Bros. is a 1983 platform game developed and published for arcades by Nintendo"},"pwa":true},
		{"name":"Candy Crush","icon":"https://cdn2.downdetector.com/static/uploads/logo/mzl.ehlcwpta.png","type":"app","data":{"type":"IFrame","url":"https://svelte-candy-crush.vercel.app/","gallery":["https://media-cldnry.s-nbcnews.com/image/upload/t_nbcnews-fp-1200-630,f_auto,q_auto:best/newscms/2014_04/133241/candy-crush-saga-screenshot-01.jpg","https://www.mobygames.com/images/shots/l/628983-candy-crush-saga-android-screenshot-the-chocolate-candy-covered.jpg","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSKPaARKhM6RGzdTQi0YwqKHZmm_eNxUn2Emw&usqp=CAU"],"desc":"Candy Crush Saga is a free-to-play match-three puzzle video game released by King on April 12, 2012,","feat":"Candy beans."},"pwa":true},
		{"name":"Visual Studio Code","icon":"https://raw.githubusercontent.com/blueedgetechno/win11React/master/public/img/icon/code.png","type":"app","data":{"type":"IFrame","url":"https://github1s.com/blueedgetechno/win11React","invert":true,"gallery":["https://code.visualstudio.com/assets/home/home-screenshot-win.png"],"desc":"Visual Studio Code is a free, lightweight, and extensible code editor for building web, desktop, and mobile applications, using any programming language and framework.\nVisual Studio Code has built-in support for Git source control management and powerful integrations with GitHub, an integrated debugger, and smart code completion with IntelliSense and with Al-driven IntelliCode. With over 30,000 extensions and themes in the Visual Studio Code Marketplace, you can customize the features and the look of Visual Studio Code to fit your needs, preferences, and style.\nYou can use Visual Studio Code to build any kind of app, for web, desktop, and mobile. Visual Studio Code supports JavaScript and TypeScript natively and offers extensions for coding in languages such as Python, Java, C/C++, C#, Go, Rust, PHP, and many more.","feat":"Fast, Powerful Editing-Linting, multi-cursor editing, parameter hints, and other powerful editing features.\nOver 30,000 extensions, and growing - Enable additional languages, themes, debuggers, commands, and more. VS Code's growing community shares their secret sauce to improve your workflow.\nBuild any app type, using any programming language and framework, including JavaScript and TypeScript, Python, Java, C/C++, C#, Go, Rust, PHP, and many more, as well as many popular technologies.\nSupport for notebooks including Jupyter, for data science and Al development.\nBuilt-in support for Git source control management and integrations with GitHub for managing issues and pull requests.\nIntelligent Code Completion - IntelliSense and Al-driven IntelliCode offer completions for variables, methods, and imported modules.\nRich Debugging-Print debugging is a thing of the past. Use debugging tools directly in VS Code.\nWrite code from anywhere with the Visual Studio Code Remote extensions and support for GitHub Codespaces."},"pwa":true},
		{"name":"Python Compiler","icon":"https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/1200px-Python-logo-notext.svg.png","type":"app","data":{"type":"IFrame","url":"https://www.programiz.com/python-programming/online-compiler/","gallery":["https://cdn.programiz.com/cdn/farfuture/IwFGGPqycIxTfzLl7mPdcaqUaircnStXfipaHd4EBik/mtime:1605833048/sites/all/themes/programiz/assets/compiler.png","https://www.programiz.com/blog/content/images/2020/07/programiz-online-compiler.png"],"desc":"Compile Python"},"pwa":true},
		{"name":"Photopea","icon":"https://raw.githubusercontent.com/cupofcoffebruh/Binbows11-copy/main/Icons/photopea%20(1).png","type":"app","data":{"type":"IFrame","url":"https://www.photopea.com/","gallery":["https://lh3.googleusercontent.com/5WaMV4oSbcLQxOLsBKymdaprEij5t38HabZbqHFe2lLMatTjn3Av-Ewf3wv9NynaU2hahYh6FHNRkAMcjF29l2kWz9Y=w640-h400-e365-rj-sc0x00ffffff","https://imag.malavida.com/mvimgbig/download-fs/photopea-27203-2.jpg","https://user-images.githubusercontent.com/79121360/112741096-3d56bd00-8f37-11eb-982d-1866764e642c.png"],"desc":"Photopea is a  Photo Editor lets you edit photos, apply effects, filters, add text, crop or resize pictures, it can used for complex projects or just some photos","feat":"online foto editor easy to use great for anything you want","invert":true},"pwa":true},
		{"name":"Minecraft","icon":"https://raw.githubusercontent.com/win11react/store/main/store/img/minecraft.png","type":"app","data":{"type":"IFrame","url":"https://mcraft.fun/","gallery":["https://www.minecraft.net/content/dam/games/minecraft/key-art/CavesandCliffsPt1-dotNET-HomepagePromo-600x360.png","https://variety.com/wp-content/uploads/2019/02/minecraft-best-year-yet.png?w=600","https://www.minecraft.net/content/dam/games/minecraft/screenshots/RayTracing-MineCraft-PMP-Always-Something-New.jpg"],"desc":"Minecraft is a sandbox construction video game developed by Mojang Studios where players interact with a fully modifiable three-dimensional environment made of blocks and entities.\nIts diverse gameplay lets players choose the way they play, allowing for countless possibilities. There are three actively maintained editions of Minecraft: Java Edition, Bedrock Edition, and Education Edition.","feat":"1.1 Combat changes.\n1.2 Fletching table functionality.\n1.3 Voted updates.\n1.4 Super Fancy graphics.\n1.5 Phasing out of NBT-based crafting recipes.\n1.6 Full split of liquids from blocks.\n1.7 Shaders.\n1.8 Archaeology."},"pwa":true},
		{"name":"Excel","icon":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Microsoft_Office_Excel_%282019%E2%80%93present%29.svg/826px-Microsoft_Office_Excel_%282019%E2%80%93present%29.svg.png","type":"app","data":{"type":"IFrame","url":"https://store.win11react.com/data/excel.html","gallery":["https://www.techrepublic.com/a/hub/i/r/2019/05/31/b9b3ae1d-6799-4118-8bcf-2bc3747c018f/resize/1200x/04c6599c3bc58330bd3350dd77984274/figure-b.jpg","https://www.smartsheet.com/sites/default/files/IC-how-to-make-spreadsheet-11%20copy.jpg","https://www.techrepublic.com/a/hub/i/r/2021/05/17/0fda89a7-51a1-4ef2-9c66-d492f21b4254/resize/1200x/89b7448d974ce30168eb278f5230b2a4/excel-spreadsheet.jpg"],"desc":"Microsoft Excel is a spreadsheet developed by Microsoft for Windows, macOS, Android and iOS. It features calculation, graphing tools, pivot tables","feat":"graphing tools"},"pwa":true},
		{"name":"Word","icon":"https://raw.githubusercontent.com/win11react/store/main/store/img/word.svg","type":"app","data":{"type":"IFrame","url":"https://store.win11react.com/data/word.html","gallery":["https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE4r1GB","https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE4qsko","https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE4qiBY"],"desc":"Microsoft Word is a word processing software developed by Microsoft. It was first released on October 25, 1983, under the name Multi-Tool Word for Xenix systems","feat":"word processing"},"pwa":true}
	])
	let installed = JSON.parse(localStorage.installed).map(app=>app.name)
	localStorage.desktop = JSON.stringify(["Blue","File Explorer","Store","Browser","Spotify","Otaku Companion","osu!","Buy me a coffee","Stick Ninja","Super Mario Bros.","Candy Crush","Visual Studio Code","Python Compiler","Photopea",...installed])
}

setInterval(()=>{
	if(document.querySelector("#root > div > div > div.desktop > div.desktopCont > div:nth-child(1) > div.appName") && document.querySelector("#root > div > div > div.desktop > div.desktopCont > div:nth-child(1) > div.appName").innerText != JSON.parse(localStorage.setting).person.name) document.querySelector("#root > div > div > div.desktop > div.desktopCont > div:nth-child(1) > div.appName").innerText = JSON.parse(localStorage.setting).person.name
	if(document.querySelector(".background")) document.querySelector(".background").style.backgroundImage = `url("assetsVM/06e2364e79d006742d8d1bedba5e4d22.png")`
	if(document.querySelector(".lockscreen")) document.querySelector(".lockscreen").style.backgroundImage = `url("assetsVM/06e2364e79d006742d8d1bedba5e4d22.png")`
	if(document.querySelector(".aboutApp")) document.querySelector(".aboutApp").style.display = 'none'
	document.querySelectorAll('*[data-action="EXTERNAL"]').forEach((e)=>{
		if(e.parentElement.classList.contains('dskApp')) {e.parentElement.style.display = 'none'}
		else {e.style.display = 'none';}
	})
	document.querySelectorAll('img[src="img/wallpaper/default/img0.jpg"]').forEach((e)=>{e.src="assetsVM/06e2364e79d006742d8d1bedba5e4d22.png"})
	let namesElem = [...document.querySelectorAll("*")]
	namesElem.filter(e=>e?.innerHTML?.startsWith("Blue") && e?.innerHTML?.indexOf("Bluetooth")==-1).map(u=>u.innerHTML = u.innerHTML.replace('Blue',JSON.parse(localStorage.setting).person.name))
	// let cmdLines = [...document.querySelectorAll(".cmdLine")]
	// cmdLines.map(u=>{if(u.innerHTML.indexOf('Blue')!=-1) u.innerText = u.innerText.replace('Blue',JSON.parse(localStorage.setting).person.name)})
	document.querySelectorAll("#storeApp > div.windowScreen.flex > div.restWindow.msfull.win11Scroll > div > div.appscont.mt-8 > div >div.imageCont.prtclk.mx-4.mb-6.rounded > img").forEach(i=>{
			if(!i.src) {i.parentElement.parentElement.style.display = 'none'};
			i.onerror=()=>{i.parentElement.parentElement.style.display = 'none'}
	})
	if(document.querySelector("#root > div > div > div.desktop > div.startMenu.dpShad > div.menuBar > div.profile.handcr > div.uicon > img")) document.querySelector("#root > div > div > div.desktop > div.startMenu.dpShad > div.menuBar > div.profile.handcr > div.uicon > img").src = "assetsVM/d13618520056365762913abe48a3d1d1.png"
	if(document.querySelector("#root > div > div.lockscreen > div.fadeinScreen > div.imageCont.prtclk.rounded-full.overflow-hidden > img")) document.querySelector("#root > div > div.lockscreen > div.fadeinScreen > div.imageCont.prtclk.rounded-full.overflow-hidden > img").src = "assetsVM/d13618520056365762913abe48a3d1d1.png"
	if(document.querySelector("#edgeApp > div.windowScreen.flex.flex-col > div.restWindow.flex-grow.flex.flex-col > div.siteFrame.flex-grow.overflow-hidden > div")) document.querySelector("#edgeApp > div.windowScreen.flex.flex-col > div.restWindow.flex-grow.flex.flex-col > div.siteFrame.flex-grow.overflow-hidden > div").style.display = 'none'
})


  // Define the Konami Code sequence
  const konamiCode = "closeme";
  let konamiCodeIndex = 0;

  // Add event listener to the document for key presses
  document.addEventListener('keydown', function (event) {
    // Convert the key code to lowercase and compare with the next character in the Konami Code
    if (event.key.toLowerCase() === konamiCode[konamiCodeIndex]) {
      konamiCodeIndex++;

      // Check if the entire Konami Code has been entered
      if (konamiCodeIndex === konamiCode.length) {
        // alert("Konami Code activated! You can now perform your close action.");
        // Add your close action here, for example, close a modal or perform any other action
		fetch("/closeme")
        // Reset the Konami Code index for future use
        konamiCodeIndex = 0;
      }
    } else {
      // Reset the Konami Code index if the entered key is incorrect
      konamiCodeIndex = 0;
    }
  });

window.addEventListener('keydown',(e)=>{
	if(e.key=="Meta") event.preventDefault();
})

document.addEventListener("keydown", function(event){
	var key = event.key || event.keyCode;
	console.log(event)

	if ((event.ctrlKey && event.shiftKey && key == "I") || key=="F12") {
	   event.preventDefault();
	}
}, false);	
