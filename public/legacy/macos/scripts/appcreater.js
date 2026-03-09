function createapp(appname, website, icon, visualappname){
  buildapp(appname, icon, visualappname);
  createlaunchpadentry(appname, icon, visualappname);
  createdockicon(appname, icon);
  makeappusable(appname, website);
}

function createpremadeapp(appname, website, icon, visualappname){
  createlaunchpadentry(appname, icon, visualappname);
  createdockicon(appname, icon);
  makeappusable(appname, website);
}

function createappwithdockicon(appname, website, icon, visualappname){
  buildapp(appname, icon, visualappname);
  createlaunchpadentry(appname, icon, visualappname);
  makeappusable(appname, website);
}

function createpremadeappwithdockicon(appname, website, icon, visualappname){
  createlaunchpadentry(appname, icon, visualappname);
  makeappusable(appname,website);
}

function createlaunchpadentry(appname, icon, visualappname){

  var launchpadentry = document.createElement("div")
  launchpadentry.classList.add("launchpadentry", appname + "launchpadentry")
  document.getElementsByClassName("launchpadentries")[0].appendChild(launchpadentry)

  var launchpadentryimg = document.createElement("img")
  launchpadentryimg.src = icon
  launchpadentry.appendChild(launchpadentryimg)

  var launchpadentryname = document.createElement("p")
  launchpadentryname.innerHTML = visualappname
  launchpadentryname.setAttribute("align", "center")
  launchpadentry.appendChild(launchpadentryname)

}

function createdockicon(appname, icon){
  var dockiconimg = document.createElement("img")
  dockiconimg.src = icon
  dockiconimg.classList.add("dockicons", appname + "dockicon")
  dockiconimg.style.display = "none"
  document.getElementsByClassName("dock")[0].appendChild(dockiconimg)
}

function buildapp(appname){

  var app = document.createElement("div")
  app.classList.add("app", appname + "app")
  document.body.appendChild(app)

  var resizertopleft = document.createElement("div");
  resizertopleft.classList.add(appname + "resizer", "resizer", "top-left");
  app.appendChild(resizertopleft);
  var resizertopright = document.createElement("div");
  resizertopright.classList.add(appname + "resizer", "resizer", "top-right");
  app.appendChild(resizertopright);
  var resizerbottomleft = document.createElement("div");
  resizerbottomleft.classList.add(appname + "resizer", "resizer", "bottom-left");
  app.appendChild(resizerbottomleft);
  var resizerbottomright = document.createElement("div");
  resizerbottomright.classList.add(appname + "resizer", "resizer", "bottom-right");
  app.appendChild(resizerbottomright);

  var resizertop = document.createElement("div");
  resizertop.classList.add(appname + "resizer", "resizer", "resizertopbottom", "top");
  app.appendChild(resizertop);
  var resizerleft = document.createElement("div");
  resizerleft.classList.add(appname + "resizer", "resizer", "resizerleftright", "left");
  app.appendChild(resizerleft);
  var resizerbottom = document.createElement("div");
  resizerbottom.classList.add(appname + "resizer", "resizer", "resizertopbottom", "bottom");
  app.appendChild(resizerbottom);
  var resizerright = document.createElement("div");
  resizerright.classList.add(appname + "resizer", "resizer", "resizerleftright", "right");
  app.appendChild(resizerright);

  var appheader = document.createElement("div");
  appheader.classList.add(appname + "appheader", "appheader");
  app.appendChild(appheader)

  var close = document.createElement("div")
  close.classList.add("close", appname + "close")
  appheader.appendChild(close)

  var minimize = document.createElement("div")
  minimize.classList.add("minimize", appname + "minimize")
  appheader.appendChild(minimize)

  var maximize = document.createElement("div")
  maximize.classList.add("maximize", appname + "maximize")
  appheader.appendChild(maximize)

  var maxmin = document.createElement("div")
  maxmin.classList.add("maxmin", appname + "maxmin")
  appheader.appendChild(maxmin)

  var appiframe = document.createElement("iframe");
  appiframe.classList.add(appname + "Iframe", "appIframe")
  appiframe.id = appname + "Iframe"
  app.appendChild(appiframe)
  appiframe.setAttribute("data-responsive", "true");

}
        
function makeappusable(appname, website){
let launchpadentry = document.getElementsByClassName(appname + "launchpadentry")[0]
let app = document.getElementsByClassName(appname + "app")[0]
let appheader = document.getElementsByClassName(appname + "appheader")[0]
let close = document.getElementsByClassName(appname + "close")[0]
let maximize = document.getElementsByClassName(appname + "maximize")[0]
let minimize = document.getElementsByClassName(appname + "minimize")[0]
let maxmin = document.getElementsByClassName(appname + "maxmin")[0]
let dockicon = document.getElementsByClassName(appname + "dockicon")[0]
//let dockiconhighlight = document.querySelector("." + appname + "dockicon" + " " + ".dockiconhighlight")
var topminclose = "8%"
var leftminclose = "20%"
var widthminclose = "60%"
var heightminclose = "75%"
var topminmax = "8%"
var leftminmax = "20%"
var widthminmax = "60%"
var heightminmax = "75%"
app.style.zIndex = zIndex

function goToPage(pageUrl)
{
  if(appname == "safari"){
    urlList[urlList.length] = pageUrl;
    pos = urlList.length - 1;
    document.getElementById('safariIframe').src = pageUrl;
  }
  else{
    document.getElementById(appname + 'Iframe').src = pageUrl;
  }
}

function sleep(ms){
  return new Promise( resolver => setTimeout(resolver, ms));
 };

function bringtofront(){
  zIndex = zIndex + 2
	app.style.zIndex = zIndex;
}

function roundedcorners(){
	app.style.borderRadius = "10px"
}

window.addEventListener('mousedown', function(e) {
  if (event.target.closest("." + appname + "app")) {
      bringtofront();
}
});

function getproperties(){
	topminclose = getComputedStyle(app).getPropertyValue('top');
	leftminclose = getComputedStyle(app).getPropertyValue('left');
	widthminclose = getComputedStyle(app).getPropertyValue('width');
	heightminclose = getComputedStyle(app).getPropertyValue('height');
}

function getpropertiesmax(){
	topminmax = getComputedStyle(app).getPropertyValue('top');
	leftminmax = getComputedStyle(app).getPropertyValue('left');
	widthminmax = getComputedStyle(app).getPropertyValue('width');
	heightminmax = getComputedStyle(app).getPropertyValue('height');
}

function recoverproperties(){
  app.style.transition = "all .17s cubic-bezier(.85,.14,.14,.85), opacity 80ms linear"
	app.style.top = topminclose
	app.style.left = leftminclose
	app.style.width = widthminclose
	app.style.height = heightminclose
	app.style.opacity = "1"
}

function recoverpropertiesmaxmin(){
	app.style.transition = "all .17s cubic-bezier(.85,.14,.14,.85), opacity 80ms linear"
	app.style.top = topminmax
	app.style.left = leftminmax
	app.style.width = widthminmax
	app.style.height = heightminmax
	app.style.opacity = "1"
}

launchpadentry.addEventListener("click", ()=>{

  app.style.display = "block"
	bringtofront();
	launchpad.style.display = "none"
  dockicon.style.display = "block"
  if(appname == "safari"){
    return;
  }
  else{
    goToPage(website);
  }

})

dockicon.addEventListener("click", ()=>{

  app.style.display = "block"
	bringtofront();
	launchpad.style.display = "none"
  dockicon.style.display = "block"
  if(appname == "safari"){
    return;
  }
  else{
    goToPage(website);
  }

})

close.addEventListener("click", ()=>{

    app.style.display = "none"
    if(appname == "safari"){
      return;
    }else{
    sleep(1000).then(()=>{
      goToPage();
     })
    }
    if(appname !== "safari" && appname != "messages"){
      dockicon.style.display = "none"
    }
  
});

minimize.addEventListener("click", ()=>{
	app.style.top = "200%"
});

maximize.addEventListener("click", ()=>{
	app.style.borderRadius = "0px"
	app.style.transition = "all .17s cubic-bezier(.85,.14,.14,.85)"
	app.style.left = "0px"
	app.style.width = "100%"
	app.style.height = "calc(100% - 75px)"
	app.style.top = "0px"
  app.style.border = "none"
	getpropertiesmax();
  getproperties();
	maximize.style.display = "none"
	maxmin.style.display = "block"
});

function showmaximizehidemaxmin(){
	maximize.style.display = "block"
	maxmin.style.display = "none"
}

maxmin.addEventListener("click", ()=>{
	roundedcorners();
	app.style.transition = "all .17s cubic-bezier(.85,.14,.14,.85)"
	recoverpropertiesmaxmin();
  showmaximizehidemaxmin();
});

//draggable
        dragElement();

      function dragElement() {
          var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
          appheader.addEventListener("mousedown", ()=>{
            if(!event.target.closest(".safariURL") && !event.target.closest(".safarireloadimg")){
            dragMouseDown();
            }
          });
          }
        
          function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            // get the mouse cursor position at startup:
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            // call a function whenever the cursor moves:
            document.onmousemove = elementDrag;
          }
        
          function elementDrag(e) {
            roundedcorners();
            showmaximizehidemaxmin();
            app.style.transition = "opacity 85ms linear"
            e = e || window.event;
            e.preventDefault();
            // calculate the new cursor position:
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // set the element's new position:
            app.style.top = (app.offsetTop - pos2) + "px";
            app.style.left = (app.offsetLeft - pos1) + "px";
          }
        
          function closeDragElement() {
            /* stop moving when mouse button is released:*/
            document.onmouseup = null;
            document.onmousemove = null;
          }
        


  // resizable

    let divs = Array.from(document.getElementsByClassName(appname + "app")),
    minWidth = 420,
    minHeight = 73,
    isResizing = false;

  divs.forEach(div => {
  div.addEventListener('mousedown', mousedown);
  //select the resizers
  let resizers = div.querySelectorAll('.resizer');

  resizers.forEach(function(resizer) {
    resizer.addEventListener('mousedown', mousedownOnresizer);
  })

  function mousedownOnresizer(e) {
      let prevX = e.clientX,
          prevY = e.clientY,
          currentresizer = e.target,
          rect = div.getBoundingClientRect(),
          prevLeft = rect.left,
          prevTop  = rect.top,
          newWidth,
          newHeight;

      isResizing = true;

      window.addEventListener('mousemove', mousemove);
      window.addEventListener('mouseup', mouseup);


      function mousemove(e){
        roundedcorners();
        showmaximizehidemaxmin();
        app.style.transition = "opacity 85ms linear"
        let newX = prevX - e.clientX, //negative to the right, positive to the left
            newY = prevY - e.clientY; //negative to the bottom, positive to the top
        if (currentresizer.classList.contains('bottom-right')) {
          newWidth = rect.width - newX;
          newHeight = rect.height - newY;
          if (newWidth > minWidth) {
            div.style.width = newWidth + 'px';
          }
          if (newHeight > minHeight) {
            div.style.height = newHeight + 'px';
          }

        }
        else if (currentresizer.classList.contains('bottom-left')) {
          newWidth = rect.width + newX;
          newHeight = rect.height - newY;

          if (newWidth > minWidth) {
            div.style.left = prevLeft - newX + 'px';
            div.style.width = newWidth + 'px';
          } 
          if (newHeight > minHeight) {
            div.style.height = newHeight + 'px';
          }

        }
        else if (currentresizer.classList.contains('top-right')) {
          newWidth = rect.width - newX;
          newHeight = rect.height + newY;

          if (newWidth > minWidth) {
            div.style.width = newWidth + 'px';
          }
          if (newHeight > minHeight) {
            div.style.top = prevTop - newY + 'px';
            div.style.height = newHeight + 'px';
          }

        }
        else if (currentresizer.classList.contains('top-left')) {
          newWidth = rect.width + newX;
          newHeight = rect.height + newY;

          if (newWidth > minWidth) {
            div.style.left = prevLeft - newX + 'px';
            div.style.width = newWidth + 'px';
          }
          if (newHeight > minHeight) {
            div.style.top = prevTop - newY + 'px';
            div.style.height = newHeight + 'px';
          }
        }
        else if (currentresizer.classList.contains('top')) {
          newHeight = rect.height + newY;

          if (newHeight > minHeight) {
            div.style.top = prevTop - newY + 'px';
            div.style.height = newHeight + 'px';
          }
        }
        else if (currentresizer.classList.contains('left')) {
          newWidth = rect.width + newX;
    
          if (newWidth > minWidth) {
            div.style.left = prevLeft - newX + 'px';
            div.style.width = newWidth + 'px';
          }
        }
        else if (currentresizer.classList.contains('bottom')) {
          newHeight = rect.height - newY;

          if (newHeight > minHeight) {
            div.style.height = newHeight + 'px';
          }
        }
        else if (currentresizer.classList.contains('right')) {
          newWidth = rect.width - newX;

          if (newWidth > minWidth) {
            div.style.width = newWidth + 'px';
          }
        }
      }
      

      function mouseup() {
        isResizing = false;
        window.removeEventListener('mousemove', mousemove);
        window.removeEventListener('mouseup', mouseup);
      }
    }
  })


  function mousedown(e) {
  //get the initial mouse corrdinates and the position coordinates of the element
  let div = this,
      prevX = e.clientX,
      prevY = e.clientY,
      rect = div.getBoundingClientRect(),
      prevLeft = rect.left,
      prevTop  = rect.top;

  function mousemove(e) {
      //get horizontal and vertical distance of the mouse move
      let newX = prevX - e.clientX, //negative to the right, positive to the left
          newY = prevY - e.clientY; //negative to the bottom, positive to the top

      //set coordinates of the element to move it to its new position
      div.style.left = prevLeft - newX + 'px';
      div.style.top = prevTop - newY + 'px';
  }
  }
}