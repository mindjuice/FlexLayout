import PropTypes from "prop-types";
import React from "react";
import ReactDOM from "react-dom";
import Splitter from "./Splitter.js";
import Tab from "./Tab.js";
import TabSet from "./TabSet.js";
import DragDrop from "../DragDrop.js";
import Rect from "../Rect.js";
import DockLocation from "../DockLocation.js";
import TabNode from "../model/TabNode.js";
import TabSetNode from "../model/TabSetNode.js";
import SplitterNode from "../model/SplitterNode.js";
import Actions from "../model/Actions.js";
import Model from "../model/Model.js";

/**
 * A React component that hosts a multi-tabbed layout
 */
class Layout extends React.Component {

    /**
     * @private
     */
    constructor(props) {
        super(props);
        this.modelChanged = false;
        this.props.model.setListener(this.onModelChange.bind(this));
        this.state = {model: this.props.model, rect: new Rect(0, 0, 0, 0)};
    }

    onModelChange() {
        this.modelChanged = true;
        this.layout(this.state.model);
        if (this.props.onModelChange) {
            this.props.onModelChange(this.state.model)
        }
    }

    doAction(action) {
        if (this.props.onAction !== undefined) {
            this.props.onAction(action);
        }
        else {
            this.state.model.doAction(action);
        }
    }

    componentDidMount() {
        this.layout(this.state.model);

        // need to re-render if size changed
        window.addEventListener("resize", function (event) {
            this.layout(this.state.model);
        }.bind(this));
    }

    componentWillReceiveProps(newProps) {
        //this.log("componentWillReceiveProps");
        this.layout(newProps.model);
        if (this.props.model !== newProps.model) {
            if (this.props.model != null) {
                this.props.model.setListener(null); // stop listening to old model
            }

            newProps.model.setListener(this.onModelChange.bind(this));
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        //this.log("shouldComponentUpdate ");
        let update = this.state.model !== nextState.model
            || !this.state.rect.equals(nextState.rect)
            || this.modelChanged;

        //console.log("shouldComponentUpdate " + update);
        return update;
    }

    layout(model) {
        if (this.refs.self != undefined) {
            let domRect = this.refs.self.getBoundingClientRect();
            let rect = new Rect(0, 0, domRect.width, domRect.height);
            //this.log("layout " + rect);
            model._layout(rect);
            this.setState({model: model, rect: rect});
        }
    }

    renderChild(node, childComponents) {
        let drawChildren = node._getDrawChildren();
        for (let i = 0; i < drawChildren.length; i++) {
            let child = drawChildren[i];

            if (child.getType() === SplitterNode.TYPE) {
                childComponents.push(<Splitter key={child.getId()} layout={this} node={child}></Splitter>);
            }
            else if (child.getType() === TabSetNode.TYPE) {
                childComponents.push(<TabSet key={child.getId()} layout={this} node={child}></TabSet>);
                this.renderChild(child, childComponents);
                if (child.isMaximized()) {
                    this.maximized = true;
                }
            }
            else if (child.getType() === TabNode.TYPE) {
                let selectedTab = child.getParent().getChildren()[child.getParent().getSelected()];
                if (selectedTab == null) {
                    debugger; // this should not happen!
                }
                childComponents.push(<Tab
                    key={child.getId()}
                    layout={this}
                    node={child}
                    selected={child === selectedTab}
                    factory={this.props.factory}>
                </Tab>);
            }
            else {// is row
                this.renderChild(child, childComponents);
            }
        }
    }

    log(message) {
        console.log(message);
    }

    render() {
        //this.log("render " + this.state.rect.toString());
        let childComponents = [];

        if (this.state.rect != null) {
            this.maximized = false;
            this.renderChild(this.state.model.getRoot(), childComponents);
        }
        else {
            childComponents.push(<span key="loading">loading...</span>);
        }

        this.modelChanged = false;

        return <div ref="self" className="flexlayout__layout">{childComponents}</div>;
    }

    /**
     * Adds a new tab to the given tabset
     * @param tabsetId the id of the tabset where the new tab will be added
     * @param json the json for the new tab node
     */
    addTabToTabSet(tabsetId, json) {
        let tabsetNode = this.state.model.getNodeById(tabsetId);
        if (tabsetNode != null) {
            this.doAction(Actions.addNode(json, tabsetId, DockLocation.CENTER, -1));
        }
    }

    /**
     * Adds a new tab to the active tabset (if there is one)
     * @param json the json for the new tab node
     */
    addTabToActiveTabSet(json) {
        let tabsetNode = this.state.model.getActiveTabset();
        if (tabsetNode != null) {
            this.doAction(Actions.addNode(json, tabsetNode.getId(), DockLocation.CENTER, -1));
        }
    }

    /**
     * Adds a new tab by dragging a labeled panel to the drop location, dragging starts immediatelly
     * @param dragText the text to show on the drag panel
     * @param json the json for the new tab node
     * @param onDrop a callback to call when the drag is complete
     */
    addTabWithDragAndDrop(dragText, json, onDrop) {
        this.fnNewNodeDropped = onDrop;
        this.newTabJson = json;
        this.dragStart(null, dragText, new TabNode(this.state.model, json), null, null);
    }

    /**
     * Adds a new tab by dragging a labeled panel to the drop location, dragging starts when you
     * mouse down on the panel
     *
     * @param dragText the text to show on the drag panel
     * @param json the json for the new tab node
     * @param onDrop a callback to call when the drag is complete
     */
    addTabWithDragAndDropIndirect(dragText, json, onDrop) {
        this.fnNewNodeDropped = onDrop;
        this.newTabJson = json;

        DragDrop.instance.addGlass(this.onCancelAdd.bind(this));

        this.dragDivText = dragText;
        this.dragDiv = document.createElement("div");
        this.dragDiv.className = "flexlayout__drag_rect";
        this.dragDiv.innerHTML = this.dragDivText;
        this.dragDiv.addEventListener("mousedown", this.onDragDivMouseDown.bind(this));
        this.dragDiv.addEventListener("touchstart", this.onDragDivMouseDown.bind(this));

        let r = new Rect(10, 10, 150, 50);
        r.centerInRect(this.state.rect);
        r.positionElement(this.dragDiv);

        let rootdiv = ReactDOM.findDOMNode(this);
        rootdiv.appendChild(this.dragDiv);
    }

    onCancelAdd() {
        let rootdiv = ReactDOM.findDOMNode(this);
        rootdiv.removeChild(this.dragDiv);
        this.dragDiv = null;
        if (this.fnNewNodeDropped != null) {
            this.fnNewNodeDropped();
            this.fnNewNodeDropped = null;
        }
        DragDrop.instance.hideGlass();
    }

    onCancelDrag() {
        let rootdiv = ReactDOM.findDOMNode(this);

        try {
            rootdiv.removeChild(this.outlineDiv);
        } catch (e) {
        }

        try {
            rootdiv.removeChild(this.dragDiv);
        } catch (e) {
        }

        this.dragDiv = null;
        this.hideEdges(rootdiv);
        if (this.fnNewNodeDropped != null) {
            this.fnNewNodeDropped();
            this.fnNewNodeDropped = null;
        }
        DragDrop.instance.hideGlass();
    }

    onDragDivMouseDown(event) {
        event.preventDefault();
        this.dragStart(event, this.dragDivText, new TabNode(this.state.model, this.newTabJson), true, null, null);
    }

    dragStart(event, dragDivText, node, allowDrag, onClick, onDoubleClick) {
        if (this.maximized || !allowDrag) {
            DragDrop.instance.startDrag(event, null, null, null, null, onClick, onDoubleClick);
        }
        else {
            this.dragNode = node;
            this.dragDivText = dragDivText;
            DragDrop.instance.startDrag(event, this.onDragStart.bind(this), this.onDragMove.bind(this), this.onDragEnd.bind(this), this.onCancelDrag.bind(this), onClick, onDoubleClick);
        }
    }

    onDragStart(event) {
        let rootdiv = ReactDOM.findDOMNode(this);
        this.outlineDiv = document.createElement("div");
        this.outlineDiv.className = "flexlayout__outline_rect";
        rootdiv.appendChild(this.outlineDiv);

        if (this.dragDiv == null) {
            this.dragDiv = document.createElement("div");
            this.dragDiv.className = "flexlayout__drag_rect";
            this.dragDiv.innerHTML = this.dragDivText;
            rootdiv.appendChild(this.dragDiv);
        }
        // add edge indicators
        this.showEdges(rootdiv);

        if (this.dragNode != null && this.dragNode.getType() === TabNode.TYPE && this.dragNode.getTabRect() != null) {
            this.dragNode.getTabRect().positionElement(this.outlineDiv);
        }
        this.firstMove = true;

        return true;
    }

    onDragMove(event) {
        if (this.firstMove === false) {
            this.outlineDiv.style.transition = "top .3s, left .3s, width .3s, height .3s";
        }
        this.firstMove = false;
        let clientRect = this.refs.self.getBoundingClientRect();
        let pos = {
            x: event.clientX - clientRect.left,
            y: event.clientY - clientRect.top
        };

        this.dragDiv.style.left = (pos.x - 75) + "px";
        this.dragDiv.style.top = pos.y + "px";

        let root = this.state.model.getRoot();
        let dropInfo = root._findDropTargetNode(this.dragNode, pos.x, pos.y);
        if (dropInfo) {
            this.dropInfo = dropInfo;
            this.outlineDiv.className = dropInfo.className;
            dropInfo.rect.positionElement(this.outlineDiv);
        }
    }

    onDragEnd(event) {
        let rootdiv = ReactDOM.findDOMNode(this);
        rootdiv.removeChild(this.outlineDiv);
        rootdiv.removeChild(this.dragDiv);
        this.dragDiv = null;
        this.hideEdges(rootdiv);
        DragDrop.instance.hideGlass();


        if (this.dropInfo) {
            if (this.newTabJson != null) {
                this.doAction(Actions.addNode(this.newTabJson, this.dropInfo.node.getId(), this.dropInfo.location, this.dropInfo.index));

                if (this.fnNewNodeDropped != null) {
                    this.fnNewNodeDropped();
                    this.fnNewNodeDropped = null;
                }
                this.newTabJson = null;
            }
            else if (this.dragNode != null) {
                this.doAction(Actions.moveNode(this.dragNode.getId(), this.dropInfo.node.getId(), this.dropInfo.location, this.dropInfo.index));
            }

        }
    }

    showEdges(rootdiv) {
        if (this.state.model.isEnableEdgeDock()) {
            let domRect = rootdiv.getBoundingClientRect();
            let size = 100;
            let length = size + "px";
            let radius = "50px";
            let width = "10px";

            this.edgeTopDiv = document.createElement("div");
            this.edgeTopDiv.className = "flexlayout__edge_rect";
            this.edgeTopDiv.style.top = "0px";
            this.edgeTopDiv.style.left = (domRect.width - size) / 2 + "px";
            this.edgeTopDiv.style.width = length;
            this.edgeTopDiv.style.height = width;
            this.edgeTopDiv.style.borderBottomLeftRadius = radius;
            this.edgeTopDiv.style.borderBottomRightRadius = radius;

            this.edgeLeftDiv = document.createElement("div");
            this.edgeLeftDiv.className = "flexlayout__edge_rect";
            this.edgeLeftDiv.style.top = (domRect.height - size) / 2 + "px";
            this.edgeLeftDiv.style.left = "0px";
            this.edgeLeftDiv.style.width = width;
            this.edgeLeftDiv.style.height = length;
            this.edgeLeftDiv.style.borderTopRightRadius = radius;
            this.edgeLeftDiv.style.borderBottomRightRadius = radius;

            this.edgeBottomDiv = document.createElement("div");
            this.edgeBottomDiv.className = "flexlayout__edge_rect";
            this.edgeBottomDiv.style.bottom = "0px";
            this.edgeBottomDiv.style.left = (domRect.width - size) / 2 + "px";
            this.edgeBottomDiv.style.width = length;
            this.edgeBottomDiv.style.height = width;
            this.edgeBottomDiv.style.borderTopLeftRadius = radius;
            this.edgeBottomDiv.style.borderTopRightRadius = radius;

            this.edgeRightDiv = document.createElement("div");
            this.edgeRightDiv.className = "flexlayout__edge_rect";
            this.edgeRightDiv.style.top = (domRect.height - size) / 2 + "px";
            this.edgeRightDiv.style.right = "0px";
            this.edgeRightDiv.style.width = width;
            this.edgeRightDiv.style.height = length;
            this.edgeRightDiv.style.borderTopLeftRadius = radius;
            this.edgeRightDiv.style.borderBottomLeftRadius = radius;

            rootdiv.appendChild(this.edgeTopDiv);
            rootdiv.appendChild(this.edgeLeftDiv);
            rootdiv.appendChild(this.edgeBottomDiv);
            rootdiv.appendChild(this.edgeRightDiv);
        }
    }

    hideEdges(rootdiv) {
        if (this.state.model.isEnableEdgeDock()) {
            try {
                rootdiv.removeChild(this.edgeTopDiv);
                rootdiv.removeChild(this.edgeLeftDiv);
                rootdiv.removeChild(this.edgeBottomDiv);
                rootdiv.removeChild(this.edgeRightDiv);
            }
            catch (e) {
            }
        }
    }

    maximize(tabsetNode) {
        this.doAction(Actions.maximizeToggle(tabsetNode.getId()));
    }

    customizeTab(tabNode, renderValues) {
        if (this.props.onRenderTab) {
            this.props.onRenderTab(tabNode, renderValues);
        }
    }

    customizeTabSet(tabSetNode, renderValues) {
        if (this.props.onRenderTabSet) {
            this.props.onRenderTabSet(tabSetNode, renderValues);
        }
    }
}

Layout.propTypes = {
    model: PropTypes.instanceOf(Model).isRequired,
    factory: PropTypes.func.isRequired,

    onAction: PropTypes.func,

    onRenderTab: PropTypes.func,
    onRenderTabSet: PropTypes.func,

    onModelChange: PropTypes.func
};

export default Layout;
