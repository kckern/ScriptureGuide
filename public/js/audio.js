

var audio_queue = [];
var preloadTimer;
var audio_version = '';

function preload(verse_id)
{
	clearTimeout(preloadTimer);
	preloadTimer = setTimeout(function(){
		
		$("#audio_preloader")
			.jPlayer("setMedia", { mp3: getMP3URL(verse_id)});
	},100);
}


function initAudio()
{
	$(['/img/audioplay.png','/img/audio.gif','/img/audiooff.png']).preload();
	
	$(".nav #audio_verse").parent().unbind("click").click(function(){
		if($(this).find("img").attr("status")=="playing")
		{
			$(this).find("img").attr("src","/img/audioplay.png").attr("status","paused");
			pauseVerse();
		}
		else if($(this).find("img").attr("status")=="paused")
		{
			$(this).find("img").attr("src","/img/audio.gif").attr("status","playing");
			unPauseVerse();
		}
		else if($(this).find("img").attr("status")=="stopped")
		{
			//$(this).find("img").attr("src","/img/audioload.gif").attr("status","playing");
			$("span.audio").first().trigger("click");
		}
	});

	// Instance jPlayer
	$("#audio_player").jPlayer({
		ready: function () {
			
			//Make Play/Pause Button Appear
			
		},
		play: function(event) {
			
			//Show Pause Icon
		},
		pause: function(event) {
			
			//Show Play Icon
			
		},
		ended: function(event) {
			
			//Play next verse in Queue
			playQueue();
			
		},
		supplied: "mp3",
		wmode: "window"
	});
	
	
	
	$("#audio_preloader").jPlayer({
		supplied: "mp3",
		wmode: "window"
	});


}

var mp3_version = "";
var mp3_voice = "";
function getMP3URL(verse_id,version)
{
	//look up version
	if(audio_version=="") audio_version = "LDS";
	return "//audio.scripture.guide/"+audio_version+"/"+verse_id;
}

function waitforMP3Load()
{
	if($('#audio_player').data("jPlayer").status.currentTime==0)
	{
		//keep looking
		setTimeout(function(){waitforMP3Load();},10);
	}
	else
	{
		//change icon, it's playing
		$(".nav #audio_verse img").attr("src","/img/audio.gif").attr("status","playing");
	}
}

function playQueue()
{	
	
	$(".nav #audio_verse img").attr("src","/img/audioload.gif");	
	$(".verse.audio_playing").removeClass("audio_playing");
	if(audio_queue.length==0)
	{
		$(".nav #audio_verse img").attr("src","/img/audiooff.png");
		$(this).attr("status","stopped");
		return false;
	}
	try
	{
		$("#audio_player")
			.jPlayer("stop")
			.jPlayer("setMedia", { mp3: getMP3URL(audio_queue[0])})
			.jPlayer("play");
		
		waitforMP3Load();
			
		$(".v_"+audio_queue[0]).addClass("audio_playing");
		$(".v_"+audio_queue[0]).trigger("mouseenter");
			
		audio_queue.shift();
		if(audio_queue.length==0) return false;
		preload(audio_queue[0]);
			
	}catch(e)
	{
		console.log("request was interrupted");
	}
}




function pauseVerse()
{
	$(".nav #audio_verse img").attr("src","/img/audioplay.png");
	$("#audio_player")
		.jPlayer("pause");
}



function unPauseVerse()
{
	$(".nav #audio_verse img").attr("src","/img/audio.gif");	
	$("#audio_player")
		.jPlayer("play");
}

$.fn.preload = function() {
    this.each(function(){
        $('<img/>')[0].src = this;
    });
}

