var viewer = new Cesium.Viewer('cesiumContainer');

////////////////////////////////////////////////////////////////////////////////////////////
/// Global warnings and variables
////////////////////////////////////////////////////////////////////////////////////////////
var LatLongElev, box, oriLongLatElev = [-1000.0, -1000.0, -1000.0];
var lat_str, long_str, elev_str, myfileLineByLine, idx_IFCSITELine, IFCSITELine;
var newLat = -1000.0, newLong = -1000.0;

var myfile, mytext;

// Check for the various File API support.
if (window.File && window.FileReader && window.FileList && window.Blob) 
{
  // Great success! All the File APIs are supported.
//alert('Ales Goed!!!');
} 
else 
{
  alert('Your browser does not seem to support our file reader (HTML5 File APIs).');
}

////////////////////////////////////////////////////////////////////////////////////////////
/// Fly the camera to the current model on the map
////////////////////////////////////////////////////////////////////////////////////////////
function FlyToMyModel()
{
  if (oriLongLatElev[0] != -1000 && oriLongLatElev[1] != -1000)
  {
    viewer.camera.flyTo(
    {
        destination: Cesium.Cartesian3.fromDegrees( oriLongLatElev[0], oriLongLatElev[1], 300.0 )
    });
  }
  else
    alert('No model loaded yet!')

  // viewer.camera.DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees( box[0], box[1], box[4], box[5] );
}

////////////////////////////////////////////////////////////////////////////////////////////
/// Location picking handler
////////////////////////////////////////////////////////////////////////////////////////////
var handler;
var scene = viewer.scene;

var pick_label_entity = viewer.entities.add({
        id : "location_label",
        label : {
            show : false,
            showBackground : true,
            font : '14px monospace',
            horizontalOrigin : Cesium.HorizontalOrigin.LEFT,
            verticalOrigin : Cesium.VerticalOrigin.TOP,
            pixelOffset : new Cesium.Cartesian2(15, 0)
        }
    });


// Mouse over the globe to see the cartographic position
handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(function(movement) {

    var cartesian = viewer.camera.pickEllipsoid(movement.endPosition, scene.globe.ellipsoid);
    if (cartesian) 
    {
        var cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        // var longitudeString = Cesium.Math.toDegrees(cartographic.longitude).toFixed(2);
        // var latitudeString = Cesium.Math.toDegrees(cartographic.latitude).toFixed(2);
        var longitudeString = Cesium.Math.toDegrees(cartographic.longitude);
        var latitudeString = Cesium.Math.toDegrees(cartographic.latitude);

        pick_label_entity.position = cartesian;
        pick_label_entity.label.show = true;
        // pick_label_entity.label.text =
        //     'Lon: ' + ('   ' + longitudeString).slice(-7) + '\u00B0' +
        //     '\nLat: ' + ('   ' + latitudeString).slice(-7) + '\u00B0';
        pick_label_entity.label.text =
            'Lon: ' + ('   ' + longitudeString) +
            '\nLat: ' + ('   ' + latitudeString);

        newLat = latitudeString;
        newLong = longitudeString;

        console.log(pick_label_entity.label.text);
    } else {
        pick_label_entity.label.show = false;
    }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE, Cesium.KeyboardEventModifier.SHIFT);


////////////////////////////////////////////////////////////////////////////////////////////
/// Generates a Bbox around the specified location in LongLatElev
////////////////////////////////////////////////////////////////////////////////////////////
function GetBoxCoord(LongLatElev, bbox2d)
{
  if (LongLatElev instanceof Array && LongLatElev.length == 3)
  {
    var lat_meter = 110600, long_meter = 111300;

// Coordinates of the bbox in meters
    if (bbox2d instanceof Array && bbox2d.length == 4)
    {
      var xmin = bbox2d[0], xmax = bbox2d[1], 
          ymin = bbox2d[2], ymax = bbox2d[3];

      var pt1 = [ (LongLatElev[0] + xmin/long_meter), (LongLatElev[1] + ymin/lat_meter) ],
          pt2 = [ (LongLatElev[0] + xmax/long_meter), (LongLatElev[1] + ymin/lat_meter) ],
          pt3 = [ (LongLatElev[0] + xmax/long_meter), (LongLatElev[1] + ymax/lat_meter) ],
          pt4 = [ (LongLatElev[0] + xmin/long_meter), (LongLatElev[1] + ymax/lat_meter) ]; 

      return [pt1[0], pt1[1], pt2[0], pt2[1], pt3[0], pt3[1], pt4[0], pt4[1]];
    }

    else return ("Something went wrong..." + bbox2d.length);
  }
  else
    return ("Something went wrong..." + LongLatElev.length);
};

////////////////////////////////////////////////////////////////////////////////////////////
/// Move the model to the selected location
////////////////////////////////////////////////////////////////////////////////////////////
function ChangeModelLocation()
{
  if (newLong != -1000 && newLat != -1000)
  {
    oriLongLatElev[0] = newLong; 
    oriLongLatElev[1] = newLat;
    box = GetBoxCoord([newLong, newLat, elev_str], [-25,25,-25,25]);

    console.log("newLat = " + newLat);
    console.log("newLong = " + newLong);
    console.log("elev_str = " + elev_str);

    viewer.entities.removeById("myIFCbox");

    // Couldn't find a way to modify existing entity...
    myIFCbox = viewer.entities.add(
    {
      id : "myIFCbox",
      polygon : 
      {
          hierarchy : new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray( box ) ),
          height : elev_str,
          extrudedHeight : 10.0,
          outline : true,
          outlineColor : Cesium.Color.WHITE,
          outlineWidth : 4,
          material : Cesium.Color.fromRandom({alpha : 0.5})
        }
    });

    FlyToMyModel();
    writeNewIFCLocation();
    // viewer.entities.remove(entity);
  }
  else
    alert('There is no loaded model to move or no new location specified!')
}



////////////////////////////////////////////////////////////////////////////////////////////
/// Function to open and handle the opened files (IFC in this case)
/// With a progress bar included
/// Adapted from: https://www.html5rocks.com/en/tutorials/file/dndfiles/
////////////////////////////////////////////////////////////////////////////////////////////

var reader;
var progress = document.querySelector('.percent');

function abortRead() {
  reader.abort();
}

function errorHandler(evt) {
  switch(evt.target.error.code) {
    case evt.target.error.NOT_FOUND_ERR:
      alert('File Not Found!');
      break;
    case evt.target.error.NOT_READABLE_ERR:
      alert('File is not readable');
      break;
    case evt.target.error.ABORT_ERR:
      break; // noop
    default:
      alert('An error occurred reading this file.');
  };
}

function updateProgress(evt) {
  // evt is an ProgressEvent.
  if (evt.lengthComputable) {
    var percentLoaded = Math.round((evt.loaded / evt.total) * 100);
    // Increase the progress bar length.
    if (percentLoaded < 100) {
      progress.style.width = percentLoaded + '%';
      progress.textContent = percentLoaded + '%';
    }
  }
}

function handleFileSelect(evt) 
{

// Reset progress indicator on new file selection.
  progress.style.width = '0%';
  progress.textContent = '0%';

  reader = new FileReader();
  reader.onerror = errorHandler;
  reader.onprogress = updateProgress;
  reader.onabort = function(e) {
    alert('File read cancelled');
  };
  reader.onloadstart = function(e) {
    document.getElementById('progress_bar').className = 'loading';
  };
  reader.onload = function(e) {
    // Ensure that the progress bar displays 100% at the end.
    progress.style.width = '100%';
    progress.textContent = '100%';
    setTimeout("document.getElementById('progress_bar').className='';", 2000);
  }

  // Get the first file and its extension
  myfile = evt.target.files[0];
  reader.readAsBinaryString(myfile);
  // Get the extension of the file
  var ext = myfile.name.split('.').pop();

  if (myfile && ext == "ifc") 
  {
    var r = new FileReader();
    r.onload = function(e) 
    { 
      var contents = e.target.result;
      if (GetLatLongElev_from_IFC(contents))
      {
        alert( "Got the file.n" 
                +"name: " + myfile.name + "\n"
                +"type: " + myfile.type + "\n"
                +"size: " + myfile.size + " bytes\n"
                + "starts with: \nLat = " + oriLongLatElev[0]
                + "\nLong = " + oriLongLatElev[1]
                + "\nElev = " + oriLongLatElev[2]
                // + "\n " +  GetBoxCoord(GetLatLongElev_from_IFC(contents), [-5,5,-5,5])
          );
    
        box = GetBoxCoord(oriLongLatElev, [-25,25,-25,25]);
        
        // console.log("Value of LatLongElev: \n" + oriLongLatElev);
        console.log("my box: " + box);
        console.log("center: " + oriLongLatElev);
  
  
        viewer.entities.removeById("myIFCbox");
        pick_label_entity.label.show = false;
        viewer.entities.add(
        {
          id : "myIFCbox",
          polygon : 
          {
              hierarchy : new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray( box ) ),
              height : elev_str,
              extrudedHeight : 10.0,
              outline : true,
              outlineColor : Cesium.Color.WHITE,
              outlineWidth : 4,
              material : Cesium.Color.fromRandom({alpha : 0.5})
            }
        });
  
        FlyToMyModel();
      }

      else
        alert("No geolocation information found in the model.");

    }
    r.readAsText(myfile);
    
  }
  else 
  { 
    alert("Failed to load the file (probably not a -valid- IFC)...");
  }

  //   // files is a FileList of File objects. List some properties.
  //   var output = [];
  //   for (var i = 0, f; f = files[i]; i++) {
  //     output.push('<li><strong>', escape(f.name), '</strong> (', f.type || 'n/a', ') - ',
  //                 f.size, ' bytes, last modified: ',
  //                 f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
  //                 '</li>');
  //   }
  //   document.getElementById('list').innerHTML = '<ul>' + output.join('') + '</ul>';

}

document.getElementById('files').addEventListener('change', handleFileSelect, false);


function GetIFCFileContent(ifcfile)
{
  // Split the file in lines by relying on the ";"
  myfileLineByLine = ifcfile.split(";");

  // Find the index of the IFCSITE line
  idx_IFCSITELine = myfileLineByLine.findIndex(
      function findIFCSITE(element) 
      {return element.includes("IFCSITE");}
    );

  // Get the line
  IFCSITELine = myfileLineByLine[idx_IFCSITELine];

  // Split it to extract the Lat/Long/Elevation information
  var splitIFCSITELine = IFCSITELine.split("(");

  if (splitIFCSITELine.length < 4)
    return false;
  else
  {
    var lat_str_ori = splitIFCSITELine[2].split(")"), 
        long_str_ori = splitIFCSITELine[3].split(")"), 
        elev_ori = long_str_ori[1].split(",");
  
    console.log("IFCSITELine = " + IFCSITELine);
    console.log("lat_str_ori = " + lat_str_ori);
    console.log("long_str_ori = " + long_str_ori);
    console.log("elev_ori = " + elev_ori);
  
    lat_str = lat_str_ori[0].split(",");
    long_str = long_str_ori[0].split(",");
    
    // If the elevation is not defined put it to 0
    if (elev_ori[1] !== "$")
      elev_str = elev_ori[1];
    else
      elev_str = 0.0;
    // elev_str = 5.0;
  
    console.log("lat_str = " + lat_str);
    console.log("long_str = " + long_str);
    console.log("elev_str = " + elev_str);

    return true;
  }
}

function writeNewIFCLocation()
{
  // Split it to extract the Lat/Long/Elevation information
  var newIFCSITELine = IFCSITELine.split("(");
  var newLatSexa = ToSexagesimal(newLat), 
      newLongSexa = ToSexagesimal(newLong);

  newIFCSITELine[2] = newLatSexa + "),";
  newIFCSITELine[3] = newLongSexa + ")" + newIFCSITELine[3].split(")")[1] + ")";

  mytext = myfileLineByLine;
  mytext[idx_IFCSITELine] = newIFCSITELine.join('(');


  console.log("\noldIFCSITELine = " + IFCSITELine);
  console.log("\nnewIFCSITELine = " + newIFCSITELine.join('(') );
}


////////////////////////////////////////////////////////////////////////////////////////////
/// Converts decimal coordinates to sexagesimal (Degree Min Sec Millisec)
////////////////////////////////////////////////////////////////////////////////////////////
function ToSexagesimal(CoordInDecimal)
{
  var splitCoord, deg, 
      min, splitmin, 
      sec, splitsec, 
      milli;

  splitCoord = CoordInDecimal.toString().split(".");
  
  deg = splitCoord[0];
  min = ("0." + splitCoord[1]) * 60.0;
  if (min)
  {
    splitmin = min.toString().split(".");
    min = splitmin[0];
    sec = ("0." + splitmin[1]) * 60.0;
    if (sec)
    {
      splitsec = sec.toString().split(".");
      sec = splitsec[0];
      milli = splitsec[1];
    }
    else
      sec = 0.0;
  }
  else
  {
    min = 0.0;
    sec = 0.0;
  }

  // Put negative values if required
  if (deg < 0)
  {
    min = min * -1.0;
    sec = sec * -1.0;
    milli = milli * -1.0;
  }

  // limit the size of the output to 6 digits
  if (milli)
  {
    if (milli.toString().length < 6)
      milli = (milli.toString().padEnd(6, "0")) * (deg/Math.abs(deg));
    else if (milli.toString().length > 6)
      milli = (milli.toString().substr(0, 6)) * (deg/Math.abs(deg));

    console.log("\nSexagesimal Coordinates: " + deg + ", " + min + ", " + sec + ", " + milli ); 
    return [deg, min, sec, milli];
  }
  else
    {
      console.log("\nSexagesimal Coordinates: " + deg + ", " + min + ", " + sec + ", " + milli );
      return [deg, min, sec];
    }

}

////////////////////////////////////////////////////////////////////////////////////////////
/// Parse the IFC file and get the Lat/Long/Elevation data
////////////////////////////////////////////////////////////////////////////////////////////
function GetLatLongElev_from_IFC(ifcfile)
{

  if ( GetIFCFileContent(ifcfile) )
  {
    var lat = 0, long = 0;
    if (lat_str.length == 4)
      lat_str[2] += "." + Math.abs(lat_str[3]);
    for (i = 0; i<3; i++)
    {
      lat += lat_str[i]/Math.pow(60,i);
      // console.log(lat);
      // console.log( "For i = " + i + ", lat = " + lat_str[i] + " / " + Math.pow(60,i) + " = " + lat);
    }
  
    // console.log(long_str.length);
    if (long_str.length == 4)
      long_str[2] += "." + Math.abs(long_str[3]);
    for (i = 0; i<3; i++)
    {
      long += long_str[i]/Math.pow(60,i);
      // console.log( "For i = " + i + ", long = " + long_str[i] + " / " + Math.pow(60,i) + " = " + long);
    }
  
    ToSexagesimal(long);
    ToSexagesimal(lat);
  
    // IFC provides Lat-Long while Cesium reads Long-Lat
    oriLongLatElev = [long, lat, elev_str];
    return true;
  }
  else
    return false;

};

// viewer.entities.add({
//     polygon : {
//         hierarchy : new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray([-118.0, 30.0,
//                                                                                     -115.0, 30.0,
//                                                                                     -117.1, 31.1,
//                                                                                     -118.0, 33.0])),
//         height : 300000.0,
//         extrudedHeight : 700000.0,
//         outline : true,
//         outlineColor : Cesium.Color.WHITE,
//         outlineWidth : 4,
//         material : Cesium.Color.fromRandom({alpha : 1.0})
//     }
// });


function ExportLocation()
{
  if (newLong != -1000 && newLat != -1000 && mytext)
  {
    var text = mytext.join(';');
    var filename = "Relocated_" + myfile.name;
    var blob = new Blob([text], {type: "text/plain;charset=utf-8"});
    saveAs(blob, filename);
  }
  else
    alert('There is no new location specified!')

}