/*
 * Highlighter package for thunderbird
 * Author: André Rodier. <andre.rodier@gmail.com>
 * License: GPL 3.0
 */

var HLClass = function(id, styleName, iconDir)
{
    var self = this;

    // the name of the last selected color in the format toolbar
    self.curColor = '';

    // True only after the first initialisation.
    self.initialised = false;

    // Todo
    self.clearFormatCalled = false;

    // Each color name is translated in a html code color value
    self.realColors = {};

    // The number of currently selected nodes
    self.NbSelectedNodes = 0;

    /* Select the next color to use for the next call to the Stylize function
    */
    self.SetCurColor = function(color)
    {
        try
        {
            if ( typeof(color) != "undefined" )
            {
                self.curColor = color;

                // TODO: find a way to use only one icon. Actually, the icon should exists
                // in the pens folder...
                var icon = document.getElementById(id+'-toolbar-button');
                icon.image = "chrome://highlighter/skin/"+iconDir+"/sel-"+color+".png";
            }
        }
        catch ( e )
        {
            var msg = id+".SetCurColor: "+e.message;
            Components.utils.reportError(msg); 
        }
    };


    /* Clear the format of the current selection.
    */
    self.ClearFormat = function()
    {
        try
        {
            // Remove all the styles from the selection.
            var domndEditor = document.getElementById("content-frame");
            var htmlEditor = domndEditor.getHTMLEditor(domndEditor.contentWindow);
            
            // The HTML editor.selection is in fact, an object, that is not anymore documented
            // see the doc folder for details
            var selectionObj = htmlEditor.selection;

            // This returns the deepest container of the selection 
            var selectedContainer = htmlEditor.getSelectionContainer();

            // get the text selected from the selection object,
            var textSelected = selectionObj.toString();

            if ( textSelected == '' && selectedContainer )
            {
                // If no text is selected, it means that the cursor is placed inside an already
                // highlighted element, and we want to clear the form of this single element.
                if ( selectedContainer.hasAttribute('style') )
                {
                    var curStyle = selectedContainer.getAttribute("style");
                    var newStyle = curStyle.replace(new RegExp(styleName+':[^;]+;', 'i'), '');

                    if ( newStyle.length > 3 || selectedContainer.nodeName != 'SPAN' )
                    {
                        selectedContainer.setAttribute("style", newStyle);
                    }
                    else
                    {
                        // This is a span with no more style. To avoid pollute,
                        // remove the span itself. The span first child is a text
                        // node that contains it's value. Normally...
                        if ( selectedContainer.firstChild )
                            textSelected = selectedContainer.firstChild.nodeValue;
                        else
                            textSelected = selectedContainer.nodeValue;

                        htmlEditor.selectElement(selectedContainer);
                        htmlEditor.insertHTML(textSelected, true);
                    }
                }
            }
            else if ( selectedContainer )
            {
                // Recursively search for span with inline style,
                // and remove the style
                var nodeList = selectedContainer.childNodes;
                self.ApplyForChilds(nodeList, selectionObj, self.ClearNodeStyle);
            }
        }
        catch ( e )
        {
            var msg = id+".ClearFormat: "+e.message;
            Components.utils.reportError(msg); 
        }

        // This is necessary because due to event propagation,
        // the Stylize function is going to be called.
        self.clearFormatCalled = true;
    };

    /* This method is called just after selection (SetCurColor),
    *  or when directly clicking the corresponding stylize icon
    */
    self.Stylize = function()
    {
        try
        {
            // because the clear menu entry is inside the corresponding stylize
            // menu, this method is called just after clear.
            // this code is just here to avoid highligh again.
            if ( self.clearFormatCalled )
            {
                self.clearFormatCalled = false;
            }
            else
            {
                // get the frame editor
                var domndEditor = document.getElementById("content-frame");
                var htmlEditor = domndEditor.getHTMLEditor(domndEditor.contentWindow);

                // This returns the deepest container of the selection 
                var selectedContainer = htmlEditor.getSelectionContainer();

                // The HTML editor.selection is in fact, an object, that is not anymore documented
                // see the doc folder for details
                var selectionObj = htmlEditor.selection;

                var multipleSelection = self.IsSelectionMultiple() ;
                var selectedNodes = selectedContainer.childNodes;
                var nbNodesSelected = self.CountSelectedNodes(selectedNodes, selectionObj, true);

                if ( nbNodesSelected == 0 )
                {
                    // There is no node selected. so create an new one with the selection
                    if ( !multipleSelection )
                    {
                        self.StylizeSimpleText();
                    }
                    else
                    {
                        alert("Multiple text selection not yet supported.");
                    }
                }
                else
                {
                    self.ApplyForChilds(selectedNodes, selectionObj, self.StylizeNode);
                }
            }
        }
        catch (e)
        {
            var msg = id+".Stylize: "+e.message;
            Components.utils.reportError(msg); 
        }
    };

    /*** Private Methods ***/

    /* Create a new text node with the currently selected text,
    * and replace the selection with the new node.
    */
    self.StylizeSimpleText = function()
    {
        // Get the editor object
        var domndEditor = document.getElementById("content-frame");
        var htmlEditor = domndEditor.getHTMLEditor(domndEditor.contentWindow);
        var textSelected = htmlEditor.selection;
        var selectedContainer = htmlEditor.getSelectionContainer();

	var textStyle = self.GetNewStyleValue();
        if ( textSelected == '' && selectedContainer )
        {
	    if ( ! self.ClearNodeStyle(selectedContainer, textStyle) )
	    {
		selectedContainer.style = textStyle;
            }
        }
        else if ( textSelected != '' )
        {
            // Replace the current selection by a trimmed selection if needed
            var textString = textSelected.toString();
            var trimmed = false;
            if ( textString.match(/(^\s+|\s+$)/) )
            {
                trimmed = true;
                // textString = textString.replace(/(^\s+|\s+$)/g, '');
            }

            // create the span that will contains the selection, and apply the style
            var span = htmlEditor.createElementWithDefaults('span');
            span.style = textStyle;

            // create a text node with the selection, and append it to the span
            var textNode = document.createTextNode(textString);
            span.appendChild(textNode);

            // var space = document.createTextNode(' ');
            // htmlEditor.insertElementAtSelection(space, false);

            // Replace the selection with the element, and select it again.
            htmlEditor.insertElementAtSelection(span, true);
            htmlEditor.selectElement(span);
        }
    };

    /* Recursively apply a style on a list of selected nodes
    */
    self.ApplyForChilds = function(nodeList, selectionObj, formatFunction)
    {
        // for these markups, we need to format the element
        // only when it is fully selected.
        var exactSel = "div,table,td,th".split(',');

        for ( var c=0 ; c < nodeList.length ; c++ )
        {
            var child = nodeList.item(c);

            // The text of an element is always stored inside a child '#text' node
            var nodeText = child.firstChild ? child.firstChild.nodeValue : "" ;

            var nodeInSel = false;

            // Even if the contains node function is marked as FROZEN inside the current
            // thunderbird source code, it's not yet have been copied into the official
            // MDC documentation. It was in the XUL planet, however.
            if ( typeof(selectionObj.containsNode) != 'undefined' )
            {
                var nodeType = child.nodeName.toLowerCase();
                var partlySelected = exactSel.indexOf(nodeType) < 0;

                try
                {
                    // the last parameters means also return true if the node is part of the selection only 
                    nodeInSel = selectionObj.containsNode(child, partlySelected);
                }
                catch ( exc )
                {
                    nodeInSel = ( selectionObj.toString().indexOf(nodeText) >= 0 );
                }
            }
            else
                nodeInSel = ( selectionObj.toString().indexOf(nodeText) >= 0 );

            // The apply function can return a value indicating that we need to 
            // call recursively or not
            var cont = true;

            if ( nodeInSel )
            {
                cont = formatFunction(child);
            }

            if ( cont && child.hasChildNodes() )
            {
                // Recursively apply the clear format to all nodes.
                self.ApplyForChilds(child.childNodes, selectionObj, formatFunction);
            }
        }
    };

    /* Remove the current style from a node and optionally add a new one. Return 0 if no
    * style was found.
    */
    self.ClearNodeStyle = function(node, newStyleValue)
    {
        if ( node.hasAttributes() && node.attributes.getNamedItem('style') )
        {
            // remove current background color, and apply the new one
            var style = node.attributes.getNamedItem('style');
            var styleValue = style.nodeValue.replace(new RegExp(styleName+':[^;]+;', 'i'), '');
	    if (newStyleValue) {
		styleValue += newStyleValue;
	    }
            style.nodeValue = styleValue;
	    return 1;
        }
	else if (newStyleValue && typeof(node.setAttribute) == 'function' )
	{
            // add a new style attribute
            node.setAttribute("style", textStyleValue);
	    return 1;
	}
	return 0;
    };

    self.GetNewStyleValue = function()
    {
        // Get the real color from the last picked color
        var realColor = self.GetRealColor(self.curColor);
	return ";"+styleName+":"+realColor+' !important;';
    };

    /* Stylize one node only, with the currently selected color
    */
    self.StylizeNode = function(node)
    {
        // we'll return a boolean indicating that we have applied a style on the node,
        // so we don't need to apply it again recursively ?
        var cont = true;

	var textStyle = self.GetNewStyleValue();
	// Attempt to remove current style, and apply the new one
        if ( self.ClearNodeStyle(node, textStyle) )
        {
            if ( node.childNodes.length == 1 && node.childNodes[0].nodeName == '#text' )
                cont = false;
        }
        else if ( node.nodeValue )
        {
            // Replace this text node with a new span with computed style
            var parentNode = node.parentNode;

            // get the frame editor
            var domndEditor = document.getElementById("content-frame");
            var htmlEditor = domndEditor.getHTMLEditor(domndEditor.contentWindow);

            // create the span that will contains the selection, and apply the style
            var span = htmlEditor.createElementWithDefaults('span');
            span.style = textStyle;

            // create a text node with the selection, and append it to the span
            var textNode = document.createTextNode(node.nodeValue);
            span.appendChild(textNode);

            // Replace the selection with the element, and select it again.
            parentNode.replaceChild(span, node);

            // we don't need to continue here, because it's a text node, and does not contains children nodes
            cont = false;
        }

        return cont;
    };

    /* Recursively crawl a node, and return the number of nodes that are part of the selection
    */
    self.CountSelectedNodes = function(nodeList, selectionObj, reset)
    {
        if ( reset ) self.NbSelectedNodes = 0;

        for ( var c=0 ; c < nodeList.length ; c++ )
        {
            var child = nodeList.item(c);

            // I do not want to count text for now, just real nodes (div,span,etc)
            if ( child.nodeName == '#text' ) continue;

            // The text of an element is always stored inside a child '#text' node
            var nodeInSel = false;

            // Even if the contains node function is marked as FROZEN inside the current
            // thunderbird source code, it's not yet have been copied into the official
            // MDC documentation. It was in the XUL planet, however.
            if ( typeof(selectionObj.containsNode) != 'undefined' )
            {
                try
                {
                    // the last parameters means also return true if the node is part of the selection only 
                    nodeInSel = selectionObj.containsNode(child, true);
                }
                catch ( exc )
                {
                    nodeInSel = false;
                }

                if (nodeInSel)
                    self.NbSelectedNodes++;
            }

            if ( child.hasChildNodes() )
            {
                // Recursively search for selected nodes in the child
                self.CountSelectedNodes(child.childNodes, selectionObj, false);
            }
        }

        return self.NbSelectedNodes;
    };

    /* Return the real HTML color from a color name,
    */
    self.GetRealColor = function(colorName)
    {
        // var baseNode = htmlEditor.createElementWithDefaults('span');
        var realColor = self.realColors[colorName];

        // if there is no real color, use the same color as the one provided.
        // however, this is not guarantee to work all the time. In the future,
        // users should be able to add their own colors.
        if ( !realColor ) realColor = colorName;

        return realColor;
    };


    /* Return true or false, according to the fact that multiple
       elements have been selected in the editor.
    */
    self.IsSelectionMultiple = function()
    {
        var isMultiple = false;

        try
        {
            var domndEditor = document.getElementById("content-frame");
            var htmlEditor = domndEditor.getHTMLEditor(domndEditor.contentWindow);
            var textSelected = htmlEditor.selection;

            var range0 = textSelected.getRangeAt(0);
            var range1 = textSelected.getRangeAt(1);

            if ( range0 && range1 )
                isMultiple = true;
        }
        catch(exc)
        {
            isMultiple = false;
        }

        return isMultiple;
    };

    /* Initialise: list of colors, etc.
    */
    self.Initialise = function()
    {
        try
        {
            // Create the list of colors
            self.realColors['yellow']    = '#ff6';
            self.realColors['cyan']      = '#aff';
            self.realColors['green']     = '#9f9';
            self.realColors['pink']      = '#f6f';
            self.realColors['red']       = '#f99';

            // Useful for B&W printing
            self.realColors['lgrey']     = '#ccc';
            self.realColors['dgrey']     = '#999';

            // initialise the default color.
            // TODO: implement persistency
            var curColor = "yellow";
            self.SetCurColor(curColor);

            // Finished
            self.initialised = true;
        }
        catch (e)
        {
            var msg = id+".Initialise: "+e.message;
            Components.utils.reportError(msg); 
        }
    };

    /* Release all resources, and exit the plugin
    */
    self.Release = function()
    {
    };

    /* Return true if already initialized or false.
    */
    self.Initialised = function()
    {
        return self.initialised;
    };

    return self;
};

var highlighter = HLClass('highlighter', 'background-color', 'pens');
var textcolorizer = HLClass('textcolorizer', 'color', 'colors');

// Initialise the addon on start.
window.addEventListener("load",
    function(e)
    {
        if ( !textcolorizer.Initialised() )
            textcolorizer.Initialise();
    },
    false);

// Initialise the addon on start.
window.addEventListener("unload",
    function(e)
    {
        textcolorizer.Release();
    },
    false);

