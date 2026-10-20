function PopupCenter(e,n,t,i){var o=void 0!=window.screenLeft?window.screenLeft:screen.left,d=void 0!=window.screenTop?window.screenTop:screen.top,c=window.innerWidth?window.innerWidth:document.documentElement.clientWidth?document.documentElement.clientWidth:screen.width,w=window.innerHeight?window.innerHeight:document.documentElement.clientHeight?document.documentElement.clientHeight:screen.height,r=c/2-t/2+o,h=w/2-i/2+d,s=window.open(e,n,"scrollbars=yes, width="+t+", height="+i+", top="+h+", left="+r);return window.focus&&s.focus(),!1} 
var windows = {};
var versions_index = [];
var word_note_index = {};
var mouseOutTimer = null;
var slugref = '';
var searchterm = '';

function activateAnnotations()
{
	for(var verse_id in annotations)
	{
		for(var word_id in annotations[verse_id]['word'])
		{
			for(var i in annotations[verse_id]['word'][word_id])
			{
				var note_id = annotations[verse_id]['word'][word_id][i];
				if (!(note_id in word_note_index)) word_note_index[note_id] = [];
				word_note_index[note_id].push(word_id);
			}
		}
	}
	
	//WordLevel	
		$("span.verse a").addClass("note");
		
		$("a.note").click(function(){
			
			var verse_id = $(this).parent("span").attr("verse_id");
			var word_id = $(this).attr("word_id");
			var note_id = annotations[verse_id]['word'][word_id];

			
			PopupCenter("http://notes.scripture.guide/"+word_id,"Scripture Guide Annotations",1000,750);
			
		});
		$("a.note").mouseenter(function(){
			
		
			var verse_id = $(this).parent("span").attr("verse_id");
			var word_id = $(this).attr("word_id");
			var note_ids = annotations[verse_id]['word'][word_id];
			
			var note_id = note_ids[0];
			smallest = note_id;
			smallest_length =  word_note_index[note_id].length;
				
			for(var i in note_ids)
			{
				var note_id = note_ids[i];
				if(word_note_index[note_id].length<smallest_length)
				{
					smallest = note_id;
					smallest_length =  word_note_index[note_id].length;
				}
			}
			
			var word_selector_h = [];
			for(var i in word_note_index[smallest])
			{
				word_selector_h.push("a[word_id="+word_note_index[smallest][i]+"]");
			}
			$(word_selector_h.join()).addClass("hover");
		});
		
		
		$("a.note").mouseleave(function(){
			
			mouseOutTimer = setTimeout(function(){$(".hover").removeClass("hover");},150);
			
			
		});

}

function newVerseBox(dir)
{
	 
	var verse_id = new_verse_id = parseInt($(".versebox").attr("verse_id"));
	var index = $( ".v_"+(parseInt(verse_id))).index(".verse");
	
	while(verse_id==new_verse_id)
	{
		new_verse_id = parseInt($(".verse").eq(index).attr("verse_id"))
		if(dir==="prev") index--;
		if(dir==="next") index++;
		if(new_verse_id=="" || index<-1) return false;
	}
	
	
	$(".featherlight").trigger("click");
	$(".v_"+new_verse_id).first().trigger("contextmenu");
}

function replacePassage(version,hversion,seq,options) 
{

//console.log([version,seq,options]);

 			pauseVerse();
 			var ref = $($("h3")[seq]).attr("ref");
 			
 			$(".versionsbox").hide();
 			var replaceHTML = '';
 			var d1 = $.ajax({
 				url: "/passage",
 				data: {
 					ref: ref,
 					version: version,
 					hversion: hversion,
 					options: options,
 					searchterm: searchterm
 				},
 				success: function(data) {
 					replaceHTML = data;
 				}
 			});
 			$($("h3")[seq]).parents(".passage").addClass("fading");
 			if($(".passage.fading").length>0)
 			$(".passage.fading").css("height", $(".passage.fading")[0].scrollHeight);
 			var d0 = $(".passage.fading").children().not("h3").fadeOut(500);
 			$(".passage.fading").attr("origHeight", $(".passage.fading").outerHeight());

 				//	console.log(replaceHTML);
 				$.when(d1,d0).done(function() {
 					
					$(".chapterNav").remove();
 					var oldHeight = $(".passage.fading").attr("origHeight");
 					//$(".passage.fading").hide();
 					$(".passage.fading").html(replaceHTML);
 					$(".passage.fading").html(replaceHTML);
 					$(".passage.fading h3.heading").addClass("paddedH3");
 					
 					
 					if(typeof $(".passage.fading h3.heading").attr("tver") != "undefined")
 					{
 						var tver = 	$(".passage.fading h3.heading").attr("tver").toLowerCase();
 						slugver = "/"+	tver;
 						$(".passage.fading").removeClass (function (index, className) {
						    return (className.match (/ver_.*\s/g) || []).join(' ');
						});
 						$(".passage.fading").addClass("ver_"+tver);
 						
 					}
 					
 					if(typeof $(".passage.fading h3.heading").attr("slug") != "undefined")
 						slugref = $(".passage.fading h3.heading").attr("slug").toLowerCase().replace(/^.*\//,'');
 					
					$("h3 span.searchterm").contents().unwrap();
 					$(".passage.fading").css("height", 0);
 					if($(".passage.fading").length>0)
 					var newHeight = $(".passage.fading")[0].scrollHeight;
 					$(".passage.fading").css("height", oldHeight);
 					$(".passage.fading").animate({
 						height: newHeight,
 						overflow: ''
 					}, 500);
 					var d2 = $(".passage.fading").children().not("h3").hide().fadeIn(1000);
 					$.when(d2).done(function() {
 					if(typeof options !== "undefined")	
 					if('orig_verse_ids' in  options)
 					{
 						$(".passage.fading span.verse").addClass("fadedVerse",500,function(){
 							//	$(selector).first().scrollintoview({ duration: 0, direction: "y" });
 						});
 						var selector = '.v_'+options.orig_verse_ids.join(', .v_')+' ';
 						$(selector).stop().removeClass("fadedVerse");
					
 					}
 					
 					activateVerses(2000);
 					activateVersionIMGs($(".passage.fading").children("h3"),2000);
 				
 					if($(".passage.fading").length>0)
 					var realHeight = $(".passage.fading")[0].scrollHeight;
 					$(".passage.fading").animate({height:realHeight},100);
 					$(".passage.fading").removeClass("fading");
 						
 					});
 					
 				}); //when

}

function refPop(ref)
{
	PopupCenter("/"+ref,"Scripture Guide: Stand-in Verses",1000,750);
}

function activateVersionIMGs(el,time)
{
		
	$("h3").not(".processed").each(function(key,val){
		
		if(typeof $(this).attr("ver")==="undefined")
		{
			$(this).addClass("noreplace");
			$(this).addClass("processed");
		}else
		{
			
		
		var tver =$(this).attr("tver");
		var ver =$(this).attr("ver");
		var img =$(this).attr("img");
		
		
		var imgHTML = '';
		imgHTML = "<img class='cover' title='"+ver_names[tver]+"' src='https://media.scripture.guide/covers/"+img.toLowerCase()+".jpg'/>";
		
		var txt = $(this).html();
		var searchcount = '';
		var seq = $(this).index("h3");
		if(versions_index.length>0 && typeof versions_index[seq] != "undefined")
		{
			if(Object.keys(versions_index[seq]).length > 1)
			 searchcount = '<div>'+Object.keys(versions_index[seq]).length+' matching versions</div>';
		}
		$(this).prepend("<h4><div><a target='_blank' href='/"+reflink(ver)+"/"+reflink($(this).attr("ref"))+"'>"+$(this).attr("ref")+"</a></div>"+imgHTML+searchcount+"</h4>");

		if(typeof $(this).attr("parallel")!="undefined"   &&  user_prefs['parallel'] != "false" )  
		{
			
			var parallel = $(this).attr("parallel").split("|");
			if(parallel.length>0)
			{
				for(var x in parallel)
				{
					var pieces = parallel[x].split("*");
					$(this).append("<span class='b parallel' unselectable=\"on\" refdata='"+(pieces[1])+"' >"+pieces[0]+"</span>");
				}
			}
		
		}
		if(typeof $(this).attr("fax")!="undefined" &&  user_prefs['facsimile'] != "false" )  
		{
			if(parseInt($(this).attr("fax"))!=1) return false;
			
			$(this).append("<span class='b fax_button' unselectable=\"on\" >"+decodeURIComponent("%F0%9F%93%96")+"&nbsp;&nbsp;</span>");

		}
		if(typeof $(this).attr("audio")!="undefined" &&  user_prefs['audio'] != "false" )  
		{
			if(parseInt($(this).attr("audio"))!=1) return false;
			$(this).append("<span class='b audio' unselectable=\"on\" >"+decodeURIComponent("%F0%9F%94%8A")+"&nbsp;&nbsp;</span>");
		}
		
		//Prevent orphaned span button
		$(this).html($(this).html().replace(/([a-z])\s*<span/,"$1&nbsp;<span"))

		
		$(this).find("span").hide().fadeIn("slow");
		
		
		$(".paddedH3").removeClass("paddedH3");
		$(this).find("h4").hide().fadeIn(time);
		
		$(".tipsy").remove();
 		$('img.cover').tipsy({gravity: 'e'});
 		
 		$("span.parallel").unbind("click").click(function(e){
 			
        		e.stopPropagation();
 				refPop($(this).attr("refdata")); 
 				return false;
 		});
 		
 		 		
 		$("span.fax_button").unbind("click").click(function(e){
 			

		 	windows[$(this).parent().attr("slug")] = PopupCenter("http://img.scripture.guide/"+$(this).parent().attr("slug"),$(this).parent().attr("slug"),1200,800);
 				return false;
 		});
 		
 		
 		if($("span.audio").length>0)  initAudio();
 		$("span.audio").unbind("click").click(function(e){
 			
 			
 			//Get Verse Ids
 			audio_queue = [];
 			$(this).parent().parent().find(".verse").each(function(){
 				audio_version = $(this).attr("version");
 				if($.inArray($(this).attr("verse_id"), audio_queue) === -1) audio_queue.push($(this).attr("verse_id"));
 			});
		
 			playQueue();
 			//PlayQueue

		 	 //PopupCenter("http://mp3.scripture.guide/"+$(this).parent().attr("slug"),$(this).parent().attr("slug"),400,100);
 				return false;
 		});
 		
 	
 		$("h4 img.cover").unbind("click").click(function(){

 			
 			$this = $(this);
 			
 			

 				
 			var top = $this.first().offset().top;
 			var height = $this.height();
 			var width = $this.width();
 			if ($(".versionsbox").is(":visible") && $(".versionsbox").offset().top == top + height) {
 				$(".versionsbox").slideUp();
 			}
 			else {
 				$(".versionsbox").html("...");
 				var version = $this.parents("h3").attr("ver");
 				var ref = $this.parents("h3").attr("ref");
 				var index = $this.parents("h3").index("h3");
 				var versions = [];
 				if( versions_index != {}) versions = versions_index[index];
 				$.post("/versionselect", {
 					ver: version,
 					ref: ref, 
 					versions: versions, 
 					seq: index
 				}, function(response) {
 					//activate
 					$(".versionsbox").html(response);
 					//replace passage
 					
 						var count = $(".versionsbox img.option").length;
 						
 						if(count==0)
 						{
 							$(".versionsbox").hide();
 							return;
 						}
 					
 					 	var cols = 1;
			 			if(count>5) cols=2;
			 			if(count>10) cols=3;
			 			if(count>20) cols=4;
 						var left = ((120*-(cols-1))+$this.first().offset().left);
 						$(".versionsbox").css("left", left);
 						$(".versionsbox").css("width", width*cols);
 						$(".versionsbox").slideDown();
 					
 					$("img.option").unbind("click").click(function() {
 						
  						var version = $(this).attr("ver");
 						var seq = $(this).attr("seq");
 						replacePassage(version,version,seq);

 					}).unbind("mouseenter").bind("mouseenter",function(){
 						
 						$("img.option").fadeTo(0,0.3);
 						$(this).fadeTo(0,1);
 						
 					}); //click
 					
 					$('.versionsbox img').tipsy({
 						gravity: 's'
 					});

 					
 				});
 				$(".versionsbox").hide();
 				$(".versionsbox").css("top", top + height);
 			}
 			
 		});
 		
 		

 		
 		
		$(this).addClass("processed");
		
		}
	}); //each
}

function showversenums()
{
	if($(".verse sup").length==0)
	{
		$(".verse").prepend(function(){ 
			
			if($(this).attr("verse_label")+"" == "undefined") return "";
			
			return "<sup class='vnum'>"+$(this).attr("verse_label")+" <sup>"  
			
		});
		//$(".verse sup").css("width",0).animate({width:'auto'},350);
	//	$(".verse sup").hide().show('slide',{direction:'left'},1000);
		localStorage.setItem('verses', '1');

	}
	else 
	{
		$(".verse sup").remove();
		localStorage.setItem('verses', '0');
		
	}
	
} 

function postFLAjax()
{
	$('#comparetab').tipsy({trigger: 'manual', gravity: 's', title: function() { 
		
		return "Click on another version to compare the two."
		
		
	}});
	
	$('.versionbar .fax').click(function(e){
		 e.preventDefault();
		 
		 var url = "http://img.scripture.guide/"+$(this).attr("ver")+"/"+$(this).attr("ref")
		 	windows[url] = PopupCenter(url,url,700,1000);
		
	});
	
	//$('#comparetab').tipsy("show");
	
	$(".versionbar>img").click(function(){
		
		return false;
		$(".featherlight").trigger("click");
		var seq = $(this).parents(".versebox").attr("seq");
		var options = {};
		
		replacePassage($(this).attr("ver").toUpperCase(),$(this).attr("ver").toUpperCase(),seq,options);
	});
	
	$(".paneltabs li").click(function(){
		
		if($(this).attr("id")!="comparetab")
		{
			resetDiff();
		}
		if($(this).hasClass("locked")) return false;
		
		$(".selectedTab").removeClass("selectedTab");
		$(this).addClass("selectedTab");
		
		$(".panel").hide();
		$("."+$(this).attr("link")).show();
		
	});
	
	$("li[lead=1]").trigger("click"); 


	activateDiff();
	
	$("h5 a").click(function(){
		var dir = $(this).attr("dir");
		
		newVerseBox(dir);
		
	});
	
	$(".gridtext span").mouseenter(function(){
		var stem = $(this).attr("stem");
		$(".gridtext span").removeClass("wh");
		$(".gridtext span[stem="+stem+"]").addClass("wh");
	});
	$(".gridtext span").mouseleave(function(){
		$(".gridtext span").removeClass("wh");
	});
}

function resetDiff()
{
			$(".original_fax").removeAttr("ver");
			$(".changed_fax").removeAttr("ver");
			
	
			$(".first_diff").removeClass("first_diff");
			$(".second_diff").removeClass("second_diff");
			$("#comparetab span").html("Ⓧ");
			$("#comparetab").addClass("locked");
			diff_click_status = 0; 
}

var diff_click_status;
function activateDiff()
{
	diff_click_status = 0;
	$(".gridtext").click(function(){
		
		if(diff_click_status===0)
		{
			$(this).addClass("first_diff");
			$("#comparetab span").html("½");
			$(".diffmodel .original").html($(this).html());
			$('.diffpanel .original').attr("ver",$(this).attr("ver"));
			
			$(".diffmodel .original_meta").html($(this).attr("vtitle"));
			if($(this).siblings().first().find("img.cover").length>0)
			$(".diffmodel .original_meta").html($(this).siblings().first().find("img.cover")[0].outerHTML);
			$(".diffmodel .original_meta").attr("chapter",$(this).attr("chapter"));
			$(".diffmodel .original_meta").attr("ver",$(this).attr("ver"));
			
			var faxel = $(this).siblings().first().find(".fax");
			if($(faxel).length>0)
			{
				$('.original_fax').attr("ver",$(faxel).attr("ver"));
				$('.original_fax').attr("ref",$(faxel).attr("ref"));
			}

			diff_click_status = 1;
		}
		else if(diff_click_status===1)
		{
			$(this).addClass("second_diff");
			$("#comparetab").removeClass("locked");
			$("#comparetab span").html("✓");
			$(".diffmodel .changed").html($(this).html());
			$('.diffpanel .changed').attr("ver",$(this).attr("ver"));
			var ltext = $(".diffmodel .original").text()
			var rtext = $(".diffmodel .changed").text()
			
			$('.diffpanel').prettyTextDiff();
			$('.diffpanel .original').html($('.diffpanel .diff').html());
			$('.diffpanel .changed').html($('.diffpanel .diff').html()); 
			
			var ratio = $('.diffpanel .original span').text().length/$('.diffpanel .original del').text().length;
			
			if(ratio<1)
			{
				var r = allusion(ltext,rtext)
				$('.diffpanel .original').html(r[0]);
				$('.diffpanel .changed').html(r[1]); 
			}
			
			
			$(".diffmodel .changed_meta").html($(this).attr("vtitle"));
			if($(this).siblings().first().find("img.cover").length>0)
			$(".diffmodel .changed_meta").html($(this).siblings().first().find("img.cover")[0].outerHTML);
			
	
			
			$(".diffmodel .changed_meta").attr("chapter",$(this).attr("chapter"));
			$(".diffmodel .changed_meta").attr("ver",$(this).attr("ver"));
			

			var faxel = $(this).siblings().first().find(".fax");
			if($(faxel).length>0)
			{
				$('.changed_fax').attr("ver",$(faxel).attr("ver"));
				$('.changed_fax').attr("ref",$(faxel).attr("ref"));
			}
			
			if($('.original_fax')[0].hasAttribute("ver") && $('.changed_fax')[0].hasAttribute("ver"))
			{
				var o_ver = $('.original_fax').attr("ver");
				var o_ref = $('.original_fax').attr("ref");
				var c_ver = $('.changed_fax').attr("ver");
				var c_ref = $('.changed_fax').attr("ref");
				
				$('.original_fax').html("<img onclick='faxMe(this)' src='http://img.350.scripture.guide/=/"+o_ver+"/"+o_ref+"'/>");
				$('.changed_fax').html("<img onclick='faxMe(this)' src='http://img.350.scripture.guide/=/"+c_ver+"/"+c_ref+"'/>");
				$('#diff_fax').show();
				
			}
			else
			{
				$('#diff_fax').hide();
			}
			

			
			diff_click_status = 2; 
			$("#comparetab").trigger("click");
		}
		else if(diff_click_status===2)
		{
			resetDiff();
			
		}
	});
	
	
	$("a.chapter").unbind("click").click(function(){

		var lref  	= "/"+$(".original_meta").attr("chapter");
		var rref 	= "/"+$(".changed_meta").attr("chapter");
		var lver  	= $(".original_meta").attr("ver");
		var rver 	= $(".changed_meta").attr("ver");
		
		if(lref==rref) lref = "";
		if(lver==rver) {rver = "";}
		
		window.location = "/"+lver+lref+"~"+rver+rref; 
		
	});
}

function faxMe(elem)
{
	var url = $(elem).attr("src");
	var newurl = url.replace(/(img\.\d+\.)/g,'img.').replace(/\/=\//g,'');
	windows[url] = PopupCenter(newurl,1200,800);
}

var throttle = false;
function activateVerses(time)
{
	
	$('span.fn').unbind("mouseenter");
	$('.verse').unbind("mouseenter");
	$('.verse').unbind("mouseleave");
	$('.verse').unbind("mouseleave");
	$('.ellipses').unbind("mouseenter mouseleave click");
	
 	$('.verse').mouseenter(function(){
 		
 		$(".verse").removeClass("hoverVerse");
 		
 		var verse_id = $(this).attr("verse_id");
 		$("[verse_id="+verse_id+"]").addClass("hoverVerse");
 		
 		var ref = ''
 		if($(this).attr("version"))
 		{
 			 ref = "<img src='/img/ver.png'>"+ver_names[$(this).attr("version")];
 		}
 		else if($(this).parents(".passage").children("h3").attr("tver"))
 		{
 			ref = "<img src='/img/ver.png'>"+ver_names[$(this).parents(".passage").children("h3").attr("ver")];
 		}
 		ref += "<img src='/img/ref.png'>"+$(this).attr("ref");
 		
 		$("#status_msg").html(ref)
 		
 	});

 	$('.verse').mouseleave(function(){
 		
 		$(".verse").removeClass("hoverVerse");
 		
 	});
 	

 	
 	$('.ellipses, h3').not(".noclick").unbind("click").on('click', function(e) {
   
   		if($(this).hasClass("noreplace")) return false;
   
    	var orig_verse_ids = [];
 		$(this).parents(".passage").find("span.verse").each(
 			function(){
 				
 				var test = ($.inArray($(this).attr("verse_id"),orig_verse_ids))
 				if(test==-1)
 				orig_verse_ids.push($(this).attr("verse_id"));
 			}
 			);
 			
 		var version =  $(this).parents(".passage").find("h3").attr("ver");
 		var hversion =  $(this).parents(".passage").find("h3").attr("version");
 		var seq = $(this).parents(".passage").find("h3").index("h3");
 		var options = {
 			start:$(this).attr("heading_verse_id"),
 			end:$(this).attr("last_verse_id"),
 			orig_verse_ids:orig_verse_ids};
 			
 		replacePassage(version,hversion,seq,options)
 		
		 		
		}).on('click', 'h4', function(e) {

			//ignore if img
			if($(e.target).is('img')) return false;
			// Handle h4 click, but not when img within h4 is clicked
			e.stopPropagation();
		});

 	

	activateVersionIMGs(null,time);
	
	//Init behaviors
	if(slugref!="")	window.history.pushState({}, "Reference",slugver+"/"+slugref);
	
	$(".verse").first().trigger("mouseenter");
	
	if($(".verse").length<=1) $(".verse").first().trigger("mouseleave");


	$('.verse').featherlight( '/vbox',{openTrigger:"contextmenu"});
	//$('.verse').featherlight( '/vbox',{openTrigger:"dblclick"});
	
	
	
	
	$('h3 span,h3 h4').disableTextSelect();//No text selection on elements with a class of 'noSelect'
	
	
 	
  $('span.fn').tipsy({
    gravity: 's',
    html: true,
    class: "fn",
    title: function() {
    	
    	return(base64_decode( $(this).attr("data") ));
     
    }
  });
  
  $('span.fn').click(function(){
  	
  	if($(this).attr("type")=="ref")
  	{
  		var ref = base64_decode($(this).attr("extra"));
  		ref = ref.replace("/[\s+]/",".").toLowerCase();
		PopupCenter("/"+ref,"Scripture Guide: Footnote Lookup",1000,750);
  	}
  	if($(this).attr("type")=="ver")
  	{
  		var vers = base64_decode($(this).attr("extra"));
  		var verse_id = $(this).parent().attr("verse_id");
		PopupCenter("http://img.scripture.guide/"+vers+"/"+verse_id,"Scripture Guide Facsimile View",1200,800);
  	}
  	
    e.stopPropagation();
    e.preventDefault();
  	
  });

}

function base64_decode(str)
{
	return decodeURIComponent(escape(window.atob(str)));
}

function copyToClipboard() {

	 var emailLink = document.querySelector('#pastebin');  
	  var range = document.createRange();  
	  range.selectNode(emailLink);  
	  window.getSelection().addRange(range);

  	/* Copy the text inside the text field */
  	document.execCommand("Copy");


  try {  
    // Now that we've selected the anchor text, execute the copy command  
    var successful = document.execCommand('copy');  
    var msg = successful ? 'successful' : 'unsuccessful';  
    console.log('Copy email command was ' + msg);  
  } catch(err) {  
    console.log('Oops, unable to copy');  
  }

  // Remove the selections - NOTE: Should use
  // removeRange(range) when it is supported  
  window.getSelection().removeAllRanges();  
}


function selectedText()
{
	return false;
	console.clear();
	var sel = window.getSelection();
	var off_a = sel.anchorOffset
	var off_z = sel.focusOffset
	var node_a = sel.anchorNode;
	var node_z = sel.focusNode
	var nodes = getSelectedNodes();
	
	if(node_z==null || node_a==null) return false;
	
	var z_verse = node_z.parentElement.hasAttribute("verse_id");
	var a_verse = node_a.parentElement.hasAttribute("verse_id");

	var sel_text='';
	var i=0;
	var ids = [];
	var verses = $($(nodes).parents(".verse").get().reverse());
	if(verses.length==0) return false;
	$(verses).each(function(){
		
		if(sel_text!='' && $(this).parents(".passage").index()===0 &&  $(this).parents("p").prev("p").length===0 && $(this).parents("p").siblings("h3").index()===0  && $(this).index()===0) sel_text = sel_text + "[REFERENCE]";
		if(sel_text!='' && $(this).parent("p").length>0 && $(this).index()===0) sel_text = sel_text + "\n\n";
		if(sel_text!='' && $(this).parent("blockquote").length>0 && $(this).index()===0) sel_text = sel_text + "\n\n";
		
		if(
			$(this).hasClass("linebreak") || 
			$(this).hasClass("poetry")
			) sel_text = sel_text + "\n";
		
		if(
			$(this).hasClass("poetry") || 
			$(this).hasClass("indent")
			) sel_text = sel_text + "\t";
		if(
			$(this).hasClass("indent")
			) sel_text = sel_text + "\t";
		
		sel_text = sel_text + $(this).text();
		ids.push(parseInt($(this).attr("verse_id")));
		
	}); 
	sel_text = sel_text.replace(/^\n+/g,"");
	sel_text = sel_text.replace(/(\n){2,}/g,"\n\n");
	sel = sel.toString();
	
	front_match = sel_text.match(new RegExp('(.*?)'+sel.substr(0,10)));
	end_match = sel_text.match(new RegExp(sel.substr(sel.length-10,10)+'(.*)'));

	if(front_match!=null)
	sel_text = sel_text.substr(front_match[1].length);
	if(end_match!=null)
	sel_text = sel_text.substring(0, sel_text.length - end_match[1].length);
	
	
	sel_text = sel_text + " [REFERENCE]"; 
	
	sel_text = sel_text.replace(/ +/g," ");
	
	$("#pastebin").html(sel_text);
	
	var segs = [];
	var tmp = {min:0,max:0};
	var last = 0;
	for(var x in ids)
	{
		if(ids[x]!=tmp.max+1 && ids[x]!=tmp.max)
		{
			if(tmp.min>0)segs.push(jQuery.extend(true, {}, tmp));
			tmp.min = ids[x];
		}
		tmp.max = ids[x];
	}
	segs.push(jQuery.extend(true, {}, tmp));
	var qa= [];
	for(var s in segs) qa.push(segs[s].min+"-"+segs[s].max);

	$.getJSON( "http://api.meta_only.scripture.guide/"+qa.join(";"), function( data ) {
	  
	  for(var m in data.meta)
	  {
	  	sel_text = sel_text.replace(/\[REFERENCE\]/,"("+data.meta[m]['orig']+")");
	  }
	  
	$("#pastebin").html(sel_text);
	  console.log(sel_text);
	 // copyToClipboard();
	});
	
}

function volfilter(vol)
{
	$("#searchresults tr").show();
	$("#searchresults tr[vol!="+vol+"]").hide();
}

function nextNode(node) {
    if (node.hasChildNodes()) {
        return node.firstChild;
    } else {
        while (node && !node.nextSibling) {
            node = node.parentNode;
        }
        if (!node) {
            return null;
        }
        return node.nextSibling;
    }
}

function getRangeSelectedNodes(range) {
    var node = range.startContainer;
    var endNode = range.endContainer;

    // Special case for a range that is contained within a single node
    if (node == endNode) {
        return [node];
    }

    // Iterate nodes until we hit the end container
    var rangeNodes = [];
    while (node && node != endNode) {
        rangeNodes.push( node = nextNode(node) );
    }

    // Add partially selected nodes at the start of the range
    node = range.startContainer;
    while (node && node != range.commonAncestorContainer) {
        rangeNodes.unshift(node);
        node = node.parentNode;
    }

    return rangeNodes;
}

function getSelectedNodes() {
    if (window.getSelection) {
        var sel = window.getSelection();
        if (!sel.isCollapsed) {
            return getRangeSelectedNodes(sel.getRangeAt(0));
        }
    }
    return [];
}

function reflink(ref)
{
    ref = ref.trim();
	var link = ref;
	link = link.trim().toLowerCase();
	link = link.split(' ').join('.');
	link = link.split(/\.+/).join('.');
	link = link.split(";.").join(';');
	link = link.split(",.").join(',');
	link = link.split("–").join('-');
	return link;
}

function getDifference(a, b)
{
    var i = 0;
    var j = 0;
    var result = "";

    while (j < b.length)
    {
        if (a[i] != b[j] || i == a.length)
            result += b[j];
        else
            i++;
        j++;
    }
    return result;
}


$(function(){
	
	
	
	
	$.extend($.fn.disableTextSelect = function() {
		return this.each(function(){
			if(false){//Firefox
				$(this).css('MozUserSelect','none');
			}else if(false){//IE
				$(this).bind('selectstart',function(){return false;});
			}else{//Opera, etc.
				$(this).mousedown(function(){return false;});
			}
		});
	});

});

 
 function hidePasteBin()
 {
 	//$("#pastebin").fadeOut("fast");
 	return false;
 }

var loginCheck = function() {

	$.featherlight.close()
	if(auth2.isSignedIn.get() && typeof Cookies.get('sg_user') != "undefined")
	{
		
          return true;
	}
	else
	{
		Cookies.remove('sg_user');
		Cookies.remove('sg_mail');
		Cookies.remove('sg_face');
		$("#login_button")[0].click();
		return false;
	}


};

var logout = function() {
		$.featherlight.close()
		Cookies.remove('sg_user');
		Cookies.remove('sg_mail');
		Cookies.remove('sg_face');
		auth2.signOut();
};

function matchFormat(selecter)
{
	$("select[vol="+$(selecter).attr("vol")+"][cmp=f] option:selected").removeAttr('selected', '');
	$("select[vol="+$(selecter).attr("vol")+"][cmp=f] option[value="+$(selecter).children(":selected").first().val()+"]").attr('selected', 'selected');
}

function saveSettings() 
{
	json = {};
	json.versions = {};
	json.options = {};
	json.user = {};
	$("#settings #versions_prefs select option:selected").each(function(){
		var vol = $(this).parent().attr("vol");
		var cmp = $(this).parent().attr("cmp");
		var ver = $(this).attr("value");
		if(typeof json.versions[vol] == "undefined") json.versions[vol] = {};
		json.versions[vol][cmp] = ver;
	});
	
	
	$("#settings #options select option:selected").each(function(){
		var key = $(this).parent().attr("key");
		var val = $(this).attr("value");
		json.options[key] = val;
	});
	
	$("input[type=checkbox]").each(function(){
		
		json.options[$(this).attr("name")] = $(this).is(':checked');
	});
	$("input[type=radio]").each(function(){
		if($(this).is(':checked'))
		{
			json.options[$(this).attr("name")] = $(this).val();
		}
	});
	
	json.user.name = $("#settings #name").val();
	json.user.mail = $("#settings #mail").val();
	json.user.face = $("#settings #face").val();

	$.ajax({
	  method: "POST",
	  url: "/save.php",
	  data: {payload:json}
	})
	  .done(function( msg ) {
	    $.featherlight.close();
	    location.reload();
	  });
}

var googleUser = {};

var signedIn = false;
$(document).ready(function(){
		
		
		$(window).onbeforeunload = function() {
		    for(var x in windows)
		    {
		    	windows[x].close();
		    }
		};		
		
		$(document).keydown(function(event){
		    if(event.which=="17")
		    {
		    	if($("#pastebin").text()=="") return false;
		    	$("#pastebin")[0].select();
		    	$("#pastebin").show();
		    }
		  
		});
		


	$('#logout_button').click(function(){auth2.signOut()});
		
	$(window).scroll(function(){
			
			hidePasteBin();
			    var scroll = $(window).scrollTop();
			    var elements = $(".verse"); // VERY VERY bad performance tho, watch out!
			    var el;
			    for (var i=0; i<elements.length; i++) {
			        el = $(elements[i]);
			        if (el.offset().top >= scroll && el.is(':visible')){
			            // "el" is the first visible element here!
			            // Do something fancy with it
			
						$(el).trigger("mouseenter");
			            // Quit the loop
			            break;
			        }
			    }
			    
    
			
		});
	
 		$('.nav li').tipsy({gravity: 's'});
		
		activateVerses(0);
		$(document).mouseup( function(e) { selectedText();	});
    	document.addEventListener('copy', hidePasteBin);
		
		if(localStorage.getItem('verses')=="1") showversenums();
	});