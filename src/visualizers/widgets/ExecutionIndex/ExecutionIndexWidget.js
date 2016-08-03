/*globals define, WebGMEGlobal, $*/
/*jshint browser: true*/

define([
    'deepforge/viz/Utils',
    'widgets/LineGraph/LineGraphWidget',
    'text!./ExecTable.html',
    'css!./styles/ExecutionIndexWidget.css'
], function (
    Utils,
    LineGraphWidget,
    TableHtml
) {
    'use strict';

    var ExecutionIndexWidget,
        WIDGET_CLASS = 'execution-index',
        STATUS_TO_CLASS = {
            success: 'success',
            failed: 'danger',
            pending: '',
            running: 'warning'
        };

    ExecutionIndexWidget = function (logger, container) {
        this._logger = logger.fork('Widget');

        this.$el = container;

        this.nodes = {};
        this.graphs = {};
        this._initialize();

        this._logger.debug('ctor finished');
    };

    ExecutionIndexWidget.prototype._initialize = function () {
        // set widget class
        this.$el.addClass(WIDGET_CLASS);

        // Create split screen
        this.$left = $('<div>', {class: 'left'});
        this.$right = $('<div>', {class: 'right'});
        this.$el.append(this.$left, this.$right);

        // Create the table
        this.$table = $(TableHtml);
        this.$table.on('click', '.exec-row', event => this.onExecutionClicked(event));
        this.$table.on('click', '.node-nav', event => this.navToNode(event));
        this.$left.append(this.$table);
        this.$execList = this.$table.find('.execs-content');

        // Create the graph in the right half
        this.lineGraph = new LineGraphWidget(this._logger, this.$right);
        this.defaultSelection = null;
        this.hasRunning = false;
    };

    ExecutionIndexWidget.prototype.navToNode = function (event) {
        var id = event.target.getAttribute('data-id');
        if (typeof id === 'string') {
            WebGMEGlobal.State.registerActiveObject(id);
            event.stopPropagation();
        }
        this._logger.warn('No node id found for node-nav!');
    };

    ExecutionIndexWidget.prototype.onExecutionClicked = function (event) {
        var target = event.target,
            checked,
            id;

        while (!target.getAttribute('data-id')) {
            if (!target.parentNode) {
                this._logger.error('could not find execution id for ' + event);
                return;
            }
            target = target.parentNode;
        }
        id = target.getAttribute('data-id');

        checked = this.nodes[id].$checkbox.checked;
        if (event.target.tagName.toLowerCase() !== 'input') {
            this.setSelect(id, !checked);
        } else {
            this.setExecutionDisplayed(id, checked);
        }
    };

    ExecutionIndexWidget.prototype.onWidgetContainerResize = function (width, height) {
        this.$left.css({
            width: width/2,
            height: height
        });
        this.$right.css({
            left: width/2,
            width: width/2,
            height: height
        });
        this.lineGraph.onWidgetContainerResize(width/2, height);
        this._logger.debug('Widget is resizing...');
    };

    // Adding/Removing/Updating items
    ExecutionIndexWidget.prototype.addNode = function (desc) {
        if (desc.type === 'Execution') {
            // Add node to a table of nodes
            this.addExecLine(desc);
            this.updateSelected(desc);
        } else if (desc.type === 'line') {
            desc.type = 'line';
            this.lineGraph.addNode(desc);
        }
    };

    ExecutionIndexWidget.prototype.updatePipelineName = function (execId, name) {
        if (this.nodes[execId]) {
            this.nodes[execId].$pipeline.text(name);
        }
    };

    ExecutionIndexWidget.prototype.addExecLine = function (desc) {
        var row = $('<tr>', {class: 'exec-row', 'data-id': desc.id}),
            checkBox = $('<input>', {type: 'checkbox'}),
            statusClass = STATUS_TO_CLASS[desc.status],
            fields,
            pipeline,
            name,
            td;

        pipeline = $('<a>', {
            class: 'node-nav',
            'data-id': desc.originId
        }).text(desc.pipelineName || 'view pipeline');

        name = $('<a>', {class: 'node-nav', 'data-id': desc.id}).text(desc.name);

        fields = [
            checkBox,
            name,
            Utils.getDisplayTime(desc.originTime),
            pipeline
        ];

        for (var i = 0; i < fields.length; i++) {
            td = $('<td>');
            if ((typeof fields[i]) === 'string') {
                td.text(fields[i]);
            } else {
                td.append(fields[i]);
            }
            row.append(td);
        }

        this._logger.debug(`Adding execution ${desc.name} (${desc.id}) to list`);
        this.$execList.append(row);
        row.addClass(statusClass);

        this.nodes[desc.id] = {
            statusClass: statusClass,
            $el: row,
            $checkbox: checkBox[0],
            $pipeline: pipeline,
            $name: name
        };
    };

    ExecutionIndexWidget.prototype.removeNode = function (id) {
        if (this.nodes[id]) {
            this.nodes[id].$el.remove();
        } else if (this.graphs[id]) {
            delete this.graphs[id];
        }
        delete this.nodes[id];

        this.lineGraph.removeNode(id);  // 'nop' if node is not line
    };

    ExecutionIndexWidget.prototype.updateSelected = function (desc) {
        // If the running pipeline has been unselected, don't reselect it!
        if (desc.status === 'running') {
            this.hasRunning = true;
            this.setSelect(desc.id, true);
            if (this.defaultSelection) {
                this.setSelect(this.defaultSelection, false);
            }
        } else if (!this.hasRunning && !this.defaultSelection) {
            this.defaultSelection = desc.id;
            this.setSelect(desc.id, true);
        }
        
    };

    ExecutionIndexWidget.prototype.setSelect = function (id, checked) {
        this.nodes[id].$checkbox.checked = checked;
        this.setExecutionDisplayed(id, checked);
    };

    ExecutionIndexWidget.prototype.updateNode = function (desc) {
        var node = this.nodes[desc.id];
        if (node) {
            node.$name.text(desc.name);
            node.$el.removeClass(node.statusClass);
            node.$el.addClass(STATUS_TO_CLASS[desc.status]);

            if (STATUS_TO_CLASS[desc.status] !== node.statusClass) {
                // Only update the selection if the status has changed.
                // ie, it has started running
                this.updateSelected(desc);
            }
            this._logger.debug(`setting execution ${desc.id} to ${desc.status}`);

            node.statusClass = STATUS_TO_CLASS[desc.status];
        } else if (desc.type === 'line') {
            this.lineGraph.updateNode(desc);
        }
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    ExecutionIndexWidget.prototype.destroy = function () {
    };

    ExecutionIndexWidget.prototype.onActivate = function () {
        this._logger.debug('ExecutionIndexWidget has been activated');
    };

    ExecutionIndexWidget.prototype.onDeactivate = function () {
        this._logger.debug('ExecutionIndexWidget has been deactivated');
    };

    return ExecutionIndexWidget;
});