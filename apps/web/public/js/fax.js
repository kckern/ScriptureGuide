var l_version = '';
var r_version = '';
var meta_data = {"l":null,"r":null};
var baseImgUrl = 'http://kckern.info/workspace/faxindex/img';
var pagenum = 0;


function activateFax(side)
{
	var side;
	if(side=="l") version = l_version;
	if(side=="r") version = r_version;
	
	
	//Load Left
	$.ajax({
	  method: "POST",
	  url: "/api/"+version+"/"+ref,
	  data: { "fax_data":1,"headings":0 }
	})
	  .done(function( data ) {
	    
	   // data = JSON.parse(data);
	   
	   meta_data[side] = data;
	    
	    $(".textrow ."+side).html(data.output);
	    
	   // $(".imgrow ."+side).append("<div class='highlighter'/>");
	    
	    	var ext = "jpg";
			if(side=="l") version = l_version;
			if(side=="r") version = r_version;
			if(version=="2013") ext = "png";
			
	    
	    
	    for (var i in data.meta[0].fax_data.pages)
	    {
	    	pagenum = data.meta[0].fax_data.pages[i];
			
			
			
	    	$(".imgrow ."+side).append("<div class='p_"+pagenum+"' ><img src='"+baseImgUrl+"/"+version+"/"+pagenum+"."+ext+"' /></div>");
	    	$(".thumbrow ."+side).append("<img class='p_"+pagenum+"' src='"+baseImgUrl+"/"+version+"/"+pagenum+"."+ext+"' />");
	    	
	    	
	    	
	    
	    	
	    		$(".thumbrow ."+side+" img").last().ready(function(){
	    			
	    			$(this.parent).height($(this).height()); 
	    		});
	    	
	    }
	    

	    activateFaxVerses(side);
	    
	  });
		
		//Text
		
		
		//Image
	
	
	
	//Load Right
	
	
		//Text
		
		
		//Image
	


	//Bind Scrolling

	
}

function activateFaxVerses(side)
{
	$(".textrow ."+side+" .verse").mouseenter(function(){
		highlightFaxVerse($(this).attr("verse_id"),side);
	});
	$(".textrow ."+side+" .verse").mouseout(function(){
		$(".textrow .verse").removeClass("highlight");
	});
	

	
}

function highlightFaxVerse(verse_id,side)
{
	$(".textrow .verse").removeClass("highlight");
	$(".textrow .v_"+verse_id).addClass("highlight");
	
	
	
	//Scrolls the other side of text
	faxScrolling(verse_id,side);
	
	//Highlights and scrolls the image
	highlightFaxBox("l",verse_id);
	highlightFaxBox("r",verse_id);
}


function faxScrolling(verse_id,side)
{

	var otherside = "l"; if(side=="l")  otherside = "r";
	var visual_gap = $(".textrow ."+side+" .v_"+verse_id).offset().top-$(".textrow .scrollbox."+side).offset().top;
	var goto = $("."+otherside+" .v_"+verse_id).position().top + $(".textrow .scrollbox."+otherside).scrollTop();
	$(".textrow .scrollbox."+otherside).stop();
	$(".textrow .scrollbox."+otherside).animate({scrollTop:goto-visual_gap}, 1000);
	
}

function highlightFaxBox(side,verse_id)
{
	var faxdata = meta_data[side].meta[0].fax_data.verses[verse_id];

	
	
	//Calculate Tiles
	
    //Make a Highlighter able to contain all the tiles
	
	
	var tiles = [];
	//For each tilegroup
	for(var i in faxdata)
	{
		
		var TLW=0;
		var BRW=0;
		var TLH=0;
		var BRH=0;
		
		var pageViewH = $(".p_"+faxdata[i].page).height();
		var pageViewW = $(".p_"+faxdata[i].page).width();
		var viewScale = pageViewW/faxdata[i].pageScale;
		var imgWidth = parseInt(faxdata[i].pageWidth);
		var pageHeight = pageViewH/viewScale;
		
		var imgURL = $("."+side+" .p_"+faxdata[i].page+" img").attr("src");
		
		
		var ints = ["X","Y","H","W"];
		for(var k in ints) faxdata[i][ints[k]] = parseInt(faxdata[i][ints[k]]);
		
		if (typeof faxdata[i].TLW !== 'undefined') {TLW=parseInt(faxdata[i].TLW);}
		if (typeof faxdata[i].BRW !== 'undefined') {BRW=parseInt(faxdata[i].BRW);}
		if (typeof faxdata[i].TLH !== 'undefined') {TLH=parseInt(faxdata[i].TLH);}
		if (typeof faxdata[i].BRH !== 'undefined') {BRH=parseInt(faxdata[i].BRH);}
		
		if(TLW>0)
		{
			var topTileData = {
			"X":(100*(faxdata[i].X+TLW))/faxdata[i].pageScale,
			"Y":(100*(faxdata[i].Y))/faxdata[i].pageScale,
			"H":(100*(TLH))/pageHeight,
			"W":(100*(faxdata[i].W-TLW))/faxdata[i].pageScale
			};
			
			tileViewW = pageViewW*(topTileData.W/100);
			tileViewH = pageViewW*(topTileData.H/100);
			tileBackX = (100*pageViewW*(topTileData.X/100)/(pageViewW-tileViewW));
			tileBackY = ((topTileData.Y/100)*pageViewW);
		
			tiles.push({"page":faxdata[i].page,"css":{	
				marginTop:topTileData.Y+"%",
				marginLeft:topTileData.X+"%",
				height:topTileData.H+"%",
				width:topTileData.W+"%",
				backgroundImage:"url('"+imgURL+"')",
				backgroundSize:pageViewW+"px "+pageViewH+"px",
				backgroundPosition:""+tileBackX+"%"+" -"+tileBackY+"px",
				extra:null}
			});
		
		}
		
		var mainTileData = {
			"X":(100*(faxdata[i].X))/faxdata[i].pageScale,
			"Y":(100*(faxdata[i].Y+TLH))/faxdata[i].pageScale,
			"H":(100*(faxdata[i].H-BRH-TLH))/pageHeight,
			"W":(100*(faxdata[i].W))/faxdata[i].pageScale
		};
		tileViewW = pageViewW*(mainTileData.W/100);
		tileViewH = pageViewW*(mainTileData.H/100);
		tileBackX = (100*pageViewW*(mainTileData.X/100)/(pageViewW-tileViewW));
		tileBackY = ((mainTileData.Y/100)*pageViewW);
		
			tiles.push({"page":faxdata[i].page,"css":{
				marginTop:mainTileData.Y+"%",
				marginLeft:mainTileData.X+"%",
				height:mainTileData.H+"%",
				width:mainTileData.W+"%",
				backgroundImage:"url('"+imgURL+"')",
				backgroundSize:pageViewW+"px "+pageViewH+"px",
				backgroundPosition:""+tileBackX+"%"+" -"+tileBackY+"px",
				extra:null}
			});
		
		if(BRW>0)
		{
			var bottomTileData = {
			"X":(100*(faxdata[i].X))/faxdata[i].pageScale,
			"Y":(100*(faxdata[i].Y+faxdata[i].H-BRH))/faxdata[i].pageScale,
			"H":(100*(BRH))/pageHeight,
			"W":(100*(faxdata[i].W-BRW))/faxdata[i].pageScale
			};
			
		tileViewW = pageViewW*(bottomTileData.W/100);
		tileViewH = pageViewW*(bottomTileData.H/100);
		tileBackX = (100*pageViewW*(bottomTileData.X/100)/(pageViewW-tileViewW));
		tileBackY = ((bottomTileData.Y/100)*pageViewW);
		
			tiles.push({"page":faxdata[i].page,"css":{
				marginTop:bottomTileData.Y+"%",
				marginLeft:bottomTileData.X+"%",
				height:bottomTileData.H+"%",
				width:bottomTileData.W+"%",
				backgroundImage:"url('"+imgURL+"')",
				backgroundSize:pageViewW+"px "+pageViewH+"px",
				backgroundPosition:""+tileBackX+"%"+" -"+tileBackY+"px",
				extra:null}
			});
		
		}
		


	}
	
	$(".scrollbox."+side+" .highlighter").remove();
	$(".scrollbox."+side+" img").fadeTo(500,0.5);
	for(var j in tiles)
	{
		$(".imgrow .scrollbox."+side+" .p_"+tiles[j].page).prepend("<div tileclass='tile_"+j+"' class='highlighter tile_"+j+"'/>");
		
	 	$(".imgrow .scrollbox."+side+" .highlighter.tile_"+j).css(tiles[j].css);
		
	}
	
	//Set highlighter position
	var highest = null;
	var topSelector = '';
	$(".imgrow .scrollbox."+side+" .highlighter").each(function(){
	   var thisH = $(this).offset().top;
	   if (thisH < highest || highest==null) { highest = thisH; topSelector = $(this).attr("tileclass")}
	});
	
	        
            
        var scrollToHeight = 
	        $(".imgrow .scrollbox."+side).scrollTop()+
	        $(".imgrow ."+side+" ."+topSelector).offset().top-
	        $(".imgrow .scrollbox."+side).offset().top;

        $(".imgrow .scrollbox."+side).stop();
        $(".imgrow .scrollbox."+side).animate({scrollTop: (scrollToHeight)-50}, 500);
	


}

