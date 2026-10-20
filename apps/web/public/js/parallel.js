var chslug = '';
var swapslug = '';


function allusion(ltext,rtext)
{
	var larray = ltext.split(/[^a-z]+/ig);
	var lcount = larray.length;
	var rarray = rtext.split(/[^a-z]+/ig);
	var rcount = rarray.length;
	var r= [];
	for(var lstart=0; lstart <= lcount; lstart++)
	{
		for(var lend=lcount; lend > lstart; lend--)
		{
			var count = lend-lstart;
			if(count>20 | count<1) continue;
			var needle = larray.slice(lstart,lend).join(" ");
			var haystack = rarray.join(" ");
			if(haystack.toLowerCase().indexOf(needle.toLowerCase())>=0 && needle.length>4 && needle.match(/[a-z]/ig)) r.push(needle);
		}
	}
	r.sort(function(a, b) {  return a.length - b.length ||     a.localeCompare(b);  }).reverse();
	
	if (r.length<1) return [ltext,rtext];

	var prepattern = "\\b("+r.join("[a-z]*|")+")\\b";
	var pattern = RegExp(prepattern, 'gi');

	ltext = ltext.replace(pattern, '<span class="match">$&</span>'	);
	rtext = rtext.replace(pattern, '<span class="match">$&</span>'	);

	
	ltext = ltext.replace(RegExp("</span>(\\W+)<span class=\"match\">", 'gi'),"$1"	);
	rtext = rtext.replace(RegExp("</span>(\\W+)<span class=\"match\">", 'gi'),"$1"	);
	
	return [ltext,rtext];
}

function activateParallel()
{
	

	$("button.chapter").click(function(){
	
		//swap sides
		$("td").fadeTo(500,0.3);
		window.location = '/'+chslug;
		
	});
	$("button.swap").click(function(){
	
		//swap sides
		$("td").fadeTo(500,0.3);
		window.location = '/'+swapslug;
		
	});
	
	$("button.compare").click(function(){
		
		
		$(".diffrow.greyout").addClass("greyout2");
		
		//Regular
		$(".diffrow.sidebyside").prettyTextDiff();
		$(".diffrow.sidebyside").each(function(){
			
			var ratio = $(this).find('.diff span').text().length/$(this).find('.diff del').text().length
			if(ratio<0.4) return  $(this).addClass("allusion");
			$(this).find('.text div').not(".seemore").html(	$(this).find('.diff ').html());
		});
		$("td.sidebyside").html("");
		
		//Quotes
		$(".diffrow.quote").prettyTextDiff();
		$(".diffrow.quote").each(function(){
			var ratio = $(this).find('.diff span').text().length/$(this).find('.diff del').text().length
			if(ratio<0.4) return $(this).addClass("allusion");
			$(this).find('.text div').not(".seemore").html(	$(this).find('.diff ').html());
		});
		$("td.diff").html("");
		
		
		
		$(".diffrow.allusion").each(function()
		{
			
			var ltext = $(this).find(".text.original>div").first().text().trim();
			var rtext = $(this).find(".text.changed>div").first().text().trim();

			var r = allusion(ltext,rtext)
			
			$(this).find(".text.original>div").first().html(r[0]);
			$(this).find(".text.changed>div").first().html(r[1]);
			
			
		});
		
		
		
		
		$(this).prop('disabled', true);
		
	});
	
	$(".ref a.ref").click(function(){
		refPop("//"+window.location.host+$(this).attr("href"));
		return false;
	});
	
	
	$(".ref a.fax").mouseenter(function(){
		
		
		$("#floater").show();
		var newtop = ($(this).position().top - $("#floater").height()- $(this).height()-10);
		var newleft = $(this).siblings().first().position().left-10 ;
		
		if($(this).parent().hasClass("right")) newleft = $(this).parent().position().left-10 ;
		
		$("#floater").css({ 'top': newtop + 'px', 'left': newleft + 'px'});
		
		$("#floater").attr("showing",$(this).attr("id"));
		$("#floater").html("<div>Loading facsimile...</div><img src='"+$(this).attr("href").replace(/$/,"?w=390")+"' width='100%'/>");
		
		$("#floater img").load(function(){
			
			$("#floater div").remove();
			var icon_id = $(this).parent().attr("showing");
			var newtop = ($("#"+icon_id).position().top - $(this).height()- $("#"+icon_id).height()-10);
			$("#floater").css({ 'top': newtop + 'px', 'height': $(this).height()+"px"});
			$("#floater").show();
		});
		
	});
	
		$(".ref a.fax").mouseleave(function(){
			
			$("#floater").hide();
			
	});
		


	
	$(".diffrow.greyout .text div").each(function(){
		
		if($(this).height()>190)
		{
			$(this).addClass("cutoff");
			$(this).after("<div class='seemore'>See More...</div>")
		}
		
	});
	
	$("div.seemore").click(function(){
		$(this).parents("tr").find(".text div").removeClass("cutoff");
		$(this).parents("tr").find(".text div.seemore").remove();
	});
	
	
	window.history.pushState({}, "Reference", "/"+fullslug);
}



function intersection_destructive(a, b)
{
  var result = [];
  while( a.length > 0 && b.length > 0 )
  {  
     if      (a[0] < b[0] ){ a.shift(); }
     else if (a[0] > b[0] ){ b.shift(); }
     else /* they're equal */
     {
       result.push(a.shift());
       b.shift();
     }
  }

  return result;
}

function ArrNoDupe(a) {
    var temp = {};
    for (var i = 0; i < a.length; i++)
        temp[a[i]] = true;
    var r = [];
    for (var k in temp)
        r.push(k);
    return r;
}
