createpremadeappwithdockicon("safari","https://google.com/?igu=1","img/safari.png","Safari")

var safariIframe = document.getElementsByClassName('safariappIframe')[0];
const safaritext = document.getElementsByClassName("safariURL")[0];
var urlList = new Array();
var pos = 0;

window.onload = function() {
    goToPage(document.getElementById("URL").value)
};

safaritext.addEventListener("keyup", ({key}) => {
    if (key === "Enter") {
     goToPage(document.getElementById("URL").value);
    }
})

function goToPage(pageUrl)
{
    urlList[urlList.length] = pageUrl;
    pos = urlList.length - 1;
    document.getElementById('safariIframe').src = pageUrl;
}
function goBack()
{
    if (pos > 0)
    {
        pos--;
        document.getElementById('safariIframe').src = urlList[pos];
        document.getElementById("URL").value = safariIframe.src;
    }
    else
        void 0;

}
function goForward()
{
    if (pos < (urlList.length-1))
    {
        pos++;
        document.getElementById('safariIframe').src = urlList[pos];
        document.getElementById("URL").value = safariIframe.src;
    }
    else
        void 0;
}

function safarireload() {
    safariIframe.src = safariIframe.src;
}