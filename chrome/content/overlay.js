/*
 * Highlighter package for thunderbird
 * Author: André Rodier. <andre.rodier@gmail.com>
 * Author: Hari Krishna Dara <haridara@gmail.com>
 * License: GPL 3.0
 */

var HLClass = function(id, styleName, iconDir)
{
    // These are available via closure, but are not accessible during debugging, so add as members.
    this.id = id;
    this.styleName = styleName;
    this.iconDir = iconDir;

    // the name of the last selected color in the format toolbar
    this.curColor = '';

    // True only after the first initialisation.
    this.initialised = false;

    // Todo
    this.clearFormatCalled = false;

    // Each color name is translated in a html code color value
    this.realColors = {};

    // The number of currently selected nodes
    this.NbSelectedNodes = 0;

    /* Select the next color to use for the next call to the Stylize function
    */
    this.SetCurColor = function(color)
    {
        try
        {
            if ( typeof(color) != "undefined" )
            {
                this.curColor = color;

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
    this.ClearStyle = function()
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
            var selectionContainer = htmlEditor.getSelectionContainer();

            // get the text selected from the selection object,
            var textSelected = selectionObj.toString();

            dump('ClearStyle: textSelected: ' + textSelected + '\n');
            dump('ClearStyle: selectionContainer: ' + selectionContainer + '\n');
            if ( textSelected == '' && selectionContainer )
            {
                // If no text is selected, it means that the cursor is placed inside an already
                // highlighted element, and we want to clear the form of this single element.
                if ( selectionContainer.hasAttribute('style') )
                {
                    dump('ClearStyle: selectionContainer has style attribute\n');
                    var curStyle = selectionContainer.getAttribute("style");
                    dump('ClearStyle: curStyle: ' + curStyle + '\n');
                    var newStyle = curStyle.replace(new RegExp(styleName+':[^;]+;', 'ig'), '');
                    dump('ClearStyle: newStyle: ' + newStyle + '\n');

                    if ( newStyle.length > 3 || selectionContainer.nodeName != 'SPAN' )
                    {
                        dump('ClearStyle: calling setAttribute for style on selectionContainer\n');
                        selectionContainer.setAttribute("style", newStyle);
                    }
                    else
                    {
                        // This is a span with no more style. To avoid pollute,
                        // remove the span itthis. The span first child is a text
                        // node that contains it's value. Normally...
                        if ( selectionContainer.firstChild )
                        {
                            dump('ClearStyle: selecting firstChild nodeValue\n');
                            textSelected = selectionContainer.firstChild.nodeValue;
                        }
                        else
                        {
                            dump('ClearStyle: selecting nodeValue\n');
                            textSelected = selectionContainer.nodeValue;
                        }

                        htmlEditor.selectElement(selectionContainer);
                        htmlEditor.insertHTML(textSelected, true);
                    }
                }
            }
            else if ( selectionContainer )
            {
                // Recursively search for span with inline style,
                // and remove the style
                var nodeList = selectionContainer.childNodes;
                if (nodeList.length == 1 && nodeList[0].nodeName == '#text') {
                    // When there is only one node and the selection is limited
                    // to that node, you don't have access to the containing span.
                    var nodeList = selectionObj.focusNode.childNodes;
                }
                dump('ClearStyle: begin calling ApplyForChilds on childNodes: ' + nodeList + '\n');
                this.ApplyForChilds(nodeList, selectionObj, this.ClearNodeStyle);
                dump('ClearStyle: end calling ApplyForChilds on childNodes\n');
            }
        }
        catch ( e )
        {
            var msg = id+".ClearStyle: "+e.message;
            Components.utils.reportError(msg); 
        }

        // This is necessary because due to event propagation,
        // the Stylize function is going to be called.
        this.clearFormatCalled = true;
    };

    /* This method is called just after selection (SetCurColor),
    *  or when directly clicking the corresponding stylize icon
    */
    this.Stylize = function()
    {
        dump('Stylize: called\n');
        try
        {
            // because the clear menu entry is inside the corresponding stylize
            // menu, this method is called just after clear.
            // this code is just here to avoid highligh again.
            //@JSD_BREAK 1
            if ( this.clearFormatCalled )
            {
                this.clearFormatCalled = false;
            }
            else
            {
                // get the frame editor
                var domndEditor = document.getElementById("content-frame");
                var htmlEditor = domndEditor.getHTMLEditor(domndEditor.contentWindow);

                // This returns the deepest container of the selection 
                var selectionContainer = htmlEditor.getSelectionContainer();

                // The HTML editor.selection is in fact, an object, that is not anymore documented
                // see the doc folder for details
                var selectionObj = htmlEditor.selection;

                var multipleSelection = this.IsSelectionMultiple();
                var selectedNodes = selectionContainer.childNodes;
                var nbNodesSelected = this.CountSelectedNodes(selectedNodes, selectionObj, true);
                dump('Stylize: nbNodesSelected ' + nbNodesSelected + '\n');

                if ( nbNodesSelected == 0 )
                {
                    // There is no node selected. so create an new one with the selection
                    if ( !multipleSelection )
                    {
                        dump('Stylize: being calling StylizeSimpleText' + '\n');
                        this.StylizeSimpleText();
                        dump('Stylize: end calling StylizeSimpleText' + '\n');
                    }
                    else
                    {
                        alert("Multiple text selection not yet supported.");
                    }
                }
                else
                {
                    dump('Stylize: begin calling ApplyForChilds with StylizeNode\n');
                    this.ApplyForChilds(selectedNodes, selectionObj, this.StylizeNode);
                    dump('Stylize: end calling ApplyForChilds with StylizeNode\n');
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
    this.StylizeSimpleText = function()
    {
        dump('StylizeSimpleText: called' + '\n');
        // Get the editor object
        var domndEditor = document.getElementById("content-frame");
        var htmlEditor = domndEditor.getHTMLEditor(domndEditor.contentWindow);
        var textSelected = htmlEditor.selection;
        var selectionContainer = htmlEditor.getSelectionContainer();

        var textStyle = this.GetNewStyleValue();
        dump('StylizeSimpleText: textStyle: ' + textStyle + '\n');
        dump('StylizeSimpleText: textSelected: ' + textSelected + '\n');
        dump('StylizeSimpleText: selectionContainer: ' + selectionContainer + '\n');
        if ( textSelected == '' && selectionContainer )
        {
            dump('StylizeSimpleText: begin calling ClearNodeStyle' + '\n');
            if ( ! this.ClearNodeStyle(selectionContainer, textStyle) )
            {
                dump('StylizeSimpleText: setting style\n');
                selectionContainer.style = textStyle;
            }
            dump('StylizeSimpleText: end calling ClearNodeStyle' + '\n');
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
            dump('StylizeSimpleText: creating a new span\n');
            var span = htmlEditor.createElementWithDefaults('span');
            dump('StylizeSimpleText: setting style on span\n');
            span.setAttribute("style", textStyle);

            // create a text node with the selection, and append it to the span
            dump('StylizeSimpleText: creating a TextNode\n');
            var textNode = document.createTextNode(textString);
            dump('StylizeSimpleText: adding the TextNode as child to the span\n');
            span.appendChild(textNode);

            // var space = document.createTextNode(' ');
            // htmlEditor.insertElementAtSelection(space, false);

            // Replace the selection with the element, and select it again.
            dump('StylizeSimpleText: replacing original element with the span\n');
            htmlEditor.insertElementAtSelection(span, true);
            dump('StylizeSimpleText: restoring the selection\n');
            htmlEditor.selectElement(span);
        }
    };

    /* Recursively apply a style on a list of selected nodes
    */
    this.ApplyForChilds = function(nodeList, selectionObj, formatFunction)
    {
        // for these markups, we need to format the element
        // only when it is fully selected.
        var exactSel = "div,table,td,th,#text".split(',');

        for ( var c=0 ; c < nodeList.length ; c++ )
        {
            dump('ApplyForChilds: Checking node: ' + c + '\n');
            var child = nodeList.item(c);
            dump('ApplyForChilds: child: ' + child + '\n');

            // The text of an element is always stored inside a child '#text' node
            var nodeText = child.firstChild ? child.firstChild.nodeValue : (child.nodeValue ? child.nodeValue : "") ;
            dump('ApplyForChilds: nodeText: ' + nodeText + '\n');

            var nodeInSel = false;

            // Even if the contains node function is marked as FROZEN inside the current
            // thunderbird source code, it's not yet have been copied into the official
            // MDC documentation. It was in the XUL planet, however.
            if ( typeof(selectionObj.containsNode) != 'undefined' )
            {
                dump('ApplyForChilds: selectionObj.containsNode: ' + selectionObj.containsNode + '\n');
                var nodeType = child.nodeName.toLowerCase();
                var partlySelected = exactSel.indexOf(nodeType) < 0;

                try
                {
                    dump('ApplyForChilds: checking if node is in selection\n');
                    // the last parameters means also return true if the node is part of the selection only 
                    nodeInSel = selectionObj.containsNode(child, partlySelected);
                }
                catch ( exc )
                {
                    dump('ApplyForChilds: in catch block 1: ' + exc.message + '\n');
                    nodeInSel = ( selectionObj.toString().indexOf(nodeText) >= 0 );
                }
            }
            else
            {
                nodeInSel = ( selectionObj.toString().indexOf(nodeText) >= 0 );
            }
            dump('ApplyForChilds: nodeInSel: ' + nodeInSel + '\n');

            // The apply function can return a value indicating that we need to 
            // call recursively or not
            var cont = true;

            if ( nodeInSel )
            {
                dump('ApplyForChilds: begin calling formatFunction on child: ' + child + '\n')
                cont = formatFunction(child);
                dump('ApplyForChilds: end calling formatFunction\n')
            }

            if ( cont && child.hasChildNodes() )
            {
                dump('ApplyForChilds: begin calling ApplyForChilds on childNodes\n')
                // Recursively apply the clear format to all nodes.
                this.ApplyForChilds(child.childNodes, selectionObj, formatFunction);
                dump('ApplyForChilds: end calling ApplyForChilds on childNodes\n')
            }
        }
    };

    /* Remove the current style from a node and optionally add a new one. Return 0 if no
    * style was found.
    */
    this.ClearNodeStyle = function(node, newStyleValue)
    {
        dump('ClearNodeStyle: function called\n');
        if ( node.hasAttributes() && node.attributes.getNamedItem('style') )
        {
            // remove current background color, and apply the new one
            var style = node.attributes.getNamedItem('style');
            dump('ClearNodeStyle: current style: ' + style + '\n');
            var styleValue = style.nodeValue.replace(new RegExp(styleName+':[^;]+;', 'i'), '');
            if (newStyleValue) {
                styleValue += newStyleValue;
            }
            dump('ClearNodeStyle: setting new style: ' + styleValue + '\n');
            style.nodeValue = styleValue;
            return 1;
        }
        else if (newStyleValue && typeof(node.setAttribute) == 'function' )
        {
            dump('ClearNodeStyle: setting style attribute to: ' + newStyleValue + '\n');
            // add a new style attribute
            node.setAttribute("style", newStyleValue);
            return 1;
        }
        return 0;
    };

    this.GetNewStyleValue = function()
    {
        // Get the real color from the last picked color
        var realColor = this.GetRealColor(this.curColor);
        return ";"+styleName+":"+realColor+' !important;';
    };

    /* Stylize one node only, with the currently selected color
    */
    this.StylizeNode = function(node)
    {
        // we'll return a boolean indicating that we have applied a style on the node,
        // so we don't need to apply it again recursively ?
        var cont = true;

        var textStyle = this.GetNewStyleValue();
        // Attempt to remove current style, and apply the new one
        if ( this.ClearNodeStyle(node, textStyle) )
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
    this.CountSelectedNodes = function(nodeList, selectionObj, reset)
    {
        if ( reset ) this.NbSelectedNodes = 0;

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
                    this.NbSelectedNodes++;
            }

            if ( child.hasChildNodes() )
            {
                // Recursively search for selected nodes in the child
                this.CountSelectedNodes(child.childNodes, selectionObj, false);
            }
        }

        return this.NbSelectedNodes;
    };

    /* Return the real HTML color from a color name,
    */
    this.GetRealColor = function(colorName)
    {
        // var baseNode = htmlEditor.createElementWithDefaults('span');
        var realColor = this.realColors[colorName];

        // if there is no real color, use the same color as the one provided.
        // however, this is not guarantee to work all the time. In the future,
        // users should be able to add their own colors.
        if ( !realColor ) realColor = colorName;

        return realColor;
    };


    /* Return true or false, according to the fact that multiple
       elements have been selected in the editor.
    */
    this.IsSelectionMultiple = function()
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
    this.Initialise = function()
    {
        try
        {
            // Create the list of colors
            this.realColors['yellow']    = '#ff6';
            this.realColors['cyan']      = '#aff';
            this.realColors['green']     = '#9f9';
            this.realColors['pink']      = '#f6f';
            this.realColors['red']       = '#f99';

            // Useful for B&W printing
            this.realColors['lgrey']     = '#ccc';
            this.realColors['dgrey']     = '#999';

            // initialise the default color.
            // TODO: implement persistency
            var curColor = "yellow";
            this.SetCurColor(curColor);

            // Finished
            this.initialised = true;
        }
        catch (e)
        {
            var msg = id+".Initialise: "+e.message;
            Components.utils.reportError(msg); 
        }
    };

    /* Release all resources, and exit the plugin
    */
    this.Release = function()
    {
    };

    /* Return true if already initialized or false.
    */
    this.Initialised = function()
    {
        return this.initialised;
    };
};

var highlighter = new HLClass('highlighter', 'background-color', 'pens');
var textcolorizer = new HLClass('textcolorizer', 'color', 'colors');

// Initialise the addon on start.
window.addEventListener("load",
    function(e)
    {
        if ( !highlighter.Initialised() )
            highlighter.Initialise();
    },
    false);

// Initialise the addon on start.
window.addEventListener("unload",
    function(e)
    {
        highlighter.Release();
    },
    false);


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

