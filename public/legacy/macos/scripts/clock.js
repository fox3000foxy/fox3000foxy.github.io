function clock(){
    var time = new Date()
    var hr = time.getHours()
    var min = time.getMinutes()
    var sec = time.getSeconds()
    var ampm = " PM "
    if (hr < 12){
    ampm = " AM "
    }
    if (hr > 12){
    hr -= 12
    }
    if (hr < 10){
    hr = " " + hr
    }
    if (min < 10){
    min = "0" + min
    }
    
    document.getElementsByClassName("menubartime")[0].innerText = hr + ":" + min + ampm
    setTimeout("clock()", 1000)
    }
    function showDate(){
    var date = new Date()
    var year = date.getYear()
    if(year < 1000){
    year += 1900
    }
    var monthArray = new Array("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12")
    var output = new Date().toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' })
    var outputFormatted = output.replace(/,/g, '');
    document.getElementsByClassName("menubardate")[0].innerText = outputFormatted
    }
    
    if (window.addEventListener) // W3C standard
    {
      window.addEventListener('load', showDate(), clock(), false); // NB **not** 'onload'
    } 
    else if (window.attachEvent) // Microsoft
    {
      window.attachEvent('onload', showDate(), clock());
    }