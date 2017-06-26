angular.module('ontoRobApp', ['ui.bootstrap','ui.router'])
.config(function($urlRouterProvider,$locationProvider,$stateProvider){
	$urlRouterProvider.otherwise("/"); // 404
	$locationProvider.html5Mode(true);
	
	$stateProvider
		.state(
			"index",
			{
				url:"/",
				templateUrl:"home.html",
				controller:"indexCtrl"
			}
		)
		.state(
			"capabilities-ui",
			{
				url:"/capabilities-ui",
				templateUrl:"capabilities-ui.html",
				controller:"ontorobCtrl"
			}
		)
})
.controller('ontorobCtrl', ['$scope', '$http','$state','$compile','Data', ontorobCtrl])
.controller('indexCtrl', ['$scope', '$http','$timeout','$window','$state','Data', indexCtrl])
.controller('testController', ['$scope', '$http','$timeout','$window','$state','Data', testController])
.service("Data", dataService);

function dataService () {
	this.capabilities = {};
}

function testController($scope,$http,$timeout,$window,$state, Data) {
	$scope.blocks = []
	
	block1 = {
		"type":"block",
		"id":1,
		"innerblocks":[],
		"html":"block1.html"
	}
	
	block21 = {
		"type":"block",
		"id":21,
		"innerblocks":[],
		"html":"block2.html"
	}
	block22 = {
		"type":"block",
		"id":22,
		"innerblocks":[],
		"html":"block2.html"
	}
	
	block31 = {
		"type":"block",
		"id":31,
		"innerblocks":[],
		"html":"block3.html"
	}

	block32 = {
		"type":"block",
		"id":32,
		"innerblocks":[],
		"html":"block3.html"
	}
	
	block1.innerblocks.push(block21);
	block1.innerblocks.push(block22);
	
	block21.innerblocks.push(block31);
	block22.innerblocks.push(block32);
	
	console.log(block1)
	
	$scope.showFromBlock1 = function () {
		$scope.blocks = [];
		$scope.blocks.push(block1);
		console.log($scope.blocks);
	}

	$scope.showFromBlock2 = function () {
		$scope.blocks = [];
		$scope.blocks.push(block21);
		$scope.blocks.push(block22);
		console.log($scope.blocks);
	}
}

function indexCtrl($scope,$http,$timeout,$window,$state, Data) {
	$scope.errorUrl = "error.html";
	$scope.successUrl = "capabilities-ui.html";

	$http({
		method: 'GET',
		url: "http://localhost:5000/capabilities"
		//url: "http://137.108.122.193:5000/capabilities"
		//url: "http://10.229.169.122:5000/capabilities"
	}).then(function successCallback(response) {
		//$scope.capabilities = response.data;
		Data.capabilities = response.data; 
		console.log("I should redirect now");
		console.log(Data.capabilities);
		$state.go("capabilities-ui");	
	
	}, function errorCallback(response) {
		console.log("Problems while contacting the robot" + response.status);
	
	});
}

function ontorobCtrl($scope, $http, $state, $compile, Data){
	
	$scope.blockUnselectedBackgroundColor = "#C0C0C0";
	$scope.blockSelectedBackgroundColor = "#ffb459";
	$scope.enabledBackgroundColor = "#FFFFFF"
	$scope.disabledBackgroundColor  = "#C0C0C0";
	
	$scope.program = {};
	$scope.program.sequence = [];
	$scope.program.selected = false;
	$scope.program.class = "program";
	$scope.program.backgroundColor = $scope.blockUnselectedBackgroundColor;
	
	$scope.blockCounter = 0;
	
	$scope.program.blockTypes = []
	initialiseBlockTypes($scope.program.blockTypes);
	
	$scope.disablingHash = {
		"condition":"parameter",
		"statement":"capability",
		"then":"block",
		"else":"block",
		"do":"block",
		"program":"block"
	}
	
	// this variable is used to keep track of the selected block in the program
	// I may use a function that retrieves it, as every block has a "selected" field
	// but I'll do a try with this one
	$scope.selectedBlock = $scope.program;
	
	console.log("Initial object");
	$scope.capabilities = Data.capabilities;
	console.log($scope.capabilities);
	
	angular.forEach($scope.capabilities,function(messageCapability) {
		
		capabilities = messageCapability["capabs"];
		
		angular.forEach(capabilities,function(capability) {
			
			capability.class = "capability";
			capability.topic = messageCapability.topic;
			disable(capability);
			
			angular.forEach(capability["params"],function(parameter) {
				
				parameter.class = "parameter";
				parameter.value = null;
				disable(parameter);
					
			});
			
		});
		
	});
	
	// this function runs the program built so far
	// it "parses" the sequence of instantiated blocks and 
	// translates them into the needed json
	$scope.run = function () {
		console.log("Running the current program");	
		console.log($scope.program)
		
		//parse
		programObject = {"instructions":[]}
		angular.forEach($scope.program.sequence,function (block) {
			parsedInstruction = parseBlock(block);
			programObject.instructions.push(parsedInstruction);
			//console.log(parsedInstruction);
		})
		
		console.log(programObject);
		
		//send
	}

	function parseBlock(block) {
		
		if(block.class == "statement") {
			
			return parseStatement(block);
		
		}
		else if(block.class == "if-then-else") {
		
			return parseIfThenElse(block);
		
		}
		else if(block.class == "while-do") {
			
			return parseWhileDo(block);
			
		}
		else if(block.class == "repeat") {
			
			return parseRepeat(block);
			
		}
	}

	function parseStatement(statement) {
		
		var ret = {};
		ret["pkg"] = null;
		ret["name"] = null;
		ret["topic"] = statement.capability.topic;
		ret["fields"] = [];
		ret["capability"] = statement.capability.type;
		
		angular.forEach(statement.capability.params,function (parameter) {
			
			paramName = $scope.getNameFromURI(parameter.p);
			ret.fields.push(paramName);
			ret[paramName] = parameter.value;
		
		});
		
		return ret;
		
	}
	
	function parseIfThenElse(ifThenElse) {
		
		var ret = {};
		ret.type = "if";
		ret.conditions = [];
		ret.then = [];
		ret.else = [];
		
		// parsing conditions
		angular.forEach(ifThenElse.conditions, function (condition) {
				
			parsedCondition = parseCondition(condition);
			
			if('length' in parsedCondition) {
				
				for(var i = 0; i < parsedCondition.length; i++) {
					
					ret.conditions.push(parsedCondition[i]);
					
				}
				
			}
			else {
				
				ret.conditions.push(parsedCondition);
				
			}
				
		});
		
		angular.forEach(ifThenElse.then.sequence, function (thenBlock) {
		
			parsedInstruction = parseBlock(thenBlock);
			ret.then.push(parsedInstruction);
		
		});
		
		angular.forEach(ifThenElse.else.sequence, function (elseBlock) {
		
			parsedInstruction = parseBlock(elseBlock);
			ret.else.push(parsedInstruction);
		
		});		
		
		return ret;
	}
	
	function parseWhileDo(whileDo) {
		
		var ret = {};
		ret.type = "while";
		ret.conditions = [];
		ret.do = [];
		
		console.log(ret);
		
		// parsing conditions
		angular.forEach(whileDo.conditions, function (condition) {
				
			parsedCondition = parseCondition(condition);
			
			if('length' in parsedCondition) {
				
				for(var i = 0; i < parsedCondition.length; i++) {
					
					ret.conditions.push(parsedCondition[i]);
					
				}
				
			}
			else {
				
				ret.conditions.push(parsedCondition);
				
			}
				
		});
		
		angular.forEach(whileDo.do.sequence, function (doBlock) {
		
			parsedInstruction = parseBlock(doBlock);
			console.log(ret.do);
			ret.do.push(parsedInstruction);
		
		});
		
		return ret;
	}
	
	function parseCondition(condition) {
		
		if(condition.logicOperator) {
			
			logicOp = {
				
				"type":"logicOperator",
				"value":condition.logicOperator
				
			};
			
			cond = {};
			
			cond["type"] = "condition";
			cond["topic"] = condition
			cond["pkg"] = null;
			cond["name"] = null;
			cond["field"] = condition.parameter;
			cond["operator"] = condition.comparator;
			cond["val"] = condition.value;
			cond["not"] = condition.not;
		
			return [logicOp,cond];
		
		}
		else {
		
			cond = {};
			
			cond["type"] = "condition";
			cond["topic"] = condition
			cond["pkg"] = null;
			cond["name"] = null;
			cond["field"] = condition.parameter;
			cond["operator"] = condition.comparator;
			cond["val"] = condition.value;
			cond["not"] = condition.not;
			
			return cond;
		
		}
	}
	
	function parseRepeat(repeat) {
		
		var ret = {};
		ret.type = "repeat";
		ret.times = repeat.times;
		ret.do = [];
		
		angular.forEach(repeat.do.sequence, function (doBlock) {
		
			parsedInstruction = parseBlock(doBlock);
			ret.then.push(parsedInstruction);
		
		});
		
		return ret;
	}
	
	//
	$scope.addToProgram = function (block) {
		
		curBlock = {}
		curBlock.id = ++$scope.blockCounter;
		curBlock.class = block;
		curBlock.selected = false;
		curBlock.backgroundColor = $scope.blockUnselectedBackgroundColor;
		
		if(block == "statement") {
			
			console.log("Adding " + block + " statement");
			block.capability = null;
			
		}
		else if(block == "if-then-else") {
			
			console.log("Adding " + block + " statement");
			initialiseIfThenElse(curBlock);
			
		}
		else if(block == "while-do") {
			
			console.log("Adding " + block + " statement");
			initialiseWhileDo(curBlock);
			
		}
		else if(block == "repeat") {
			
			console.log("Adding " + block + " statement");
			initialiseRepeat(curBlock);
			
		}
		console.log("Current block");
		console.log(curBlock);
		console.log("Adding to sequnce of");
		console.log($scope.selectedBlock);
		
		$scope.selectedBlock.sequence.push(curBlock);
		
		console.log($scope.program);
	}
	
	
	function initialiseIfThenElse(block) {
		
		block.then = {};
		block.then.class = "then";
		block.then.sequence = [];
		block.then.selected = false;
		block.then.backgroundColor = $scope.blockUnselectedBackgroundColor;
		
		block.else = {};
		block.else.class = "else";
		block.else.sequence = [];
		block.else.selected = false;
		block.else.backgroundColor = $scope.blockUnselectedBackgroundColor;
		
		block.conditions = [];
		
		firstCondition = {}
		firstCondition.class = "condition";
		firstCondition.not = false;
		firstCondition.comparator = null;
		firstCondition.logicOperator = false;
		firstCondition.value = null;
		firstCondition.selected = false;
		firstCondition.backgroundColor = $scope.blockUnselectedBackgroundColor;
		
		firstCondition.parameter = null;
		
		block.conditions.push(firstCondition);
	}

	function initialiseWhileDo(block) {
		
		block.do = {};
		block.do.class = "do";
		block.do.sequence = [];
		block.do.selected = false;
		block.do.backgroundColor = $scope.blockUnselectedBackgroundColor;
		
		block.conditions = [];
		
		firstCondition = {}
		firstCondition.class = "condition";
		firstCondition.not = false;
		firstCondition.comparator = null;
		firstCondition.logicOperator = false;
		firstCondition.value = null;
		firstCondition.selected = false;
		firstCondition.backgroundColor = $scope.blockUnselectedBackgroundColor;
		
		firstCondition.parameter = null;
		
		block.conditions.push(firstCondition);
		
	}
	
	function initialiseRepeat(block) {
		
		block.times = 0;
		
		block.do = {};
		block.do.class = "do";
		block.do.sequence = [];
		block.do.selected = false;
		block.do.backgroundColor = $scope.blockUnselectedBackgroundColor;
		
	}
	
	$scope.select = function (clickedBlock,$event) {
		
		$event.stopPropagation();
		console.log(clickedBlock);
		$scope.selectedBlock = clickedBlock;
				
		clickedBlock.backgroundColor = $scope.blockSelectedBackgroundColor;
		clickedBlock.selected = true;
		
		// control the selection of the area
		if(clickedBlock.class != "program") {
			
			deactivateUnselected($scope.program);
			
		}
		
		angular.forEach($scope.program.sequence, function (block) {
			
			deactivateUnselected(block, clickedBlock);
			
		});
		
		disableAllBut($scope.disablingHash[clickedBlock.class]);
	}
	

	function deactivateUnselected(currentBlock, selectedBlock) {
		if(currentBlock == selectedBlock) {
			
			return
			
		}
		else if(currentBlock.class == "statement") {
			
			currentBlock.backgroundColor = $scope.blockUnselectedBackgroundColor;
			currentBlock.selected = false;
			
		}
		else if(currentBlock.class == "then" || currentBlock.class == "else" || currentBlock.class == "do" || currentBlock.class == "program") {
			
			currentBlock.backgroundColor = $scope.blockUnselectedBackgroundColor;
			currentBlock.selected = false;
			
		}
		else if(currentBlock.class == "condition"){
			
			currentBlock.backgroundColor = $scope.blockUnselectedBackgroundColor;
			currentBlock.selected = false;
			
		}
		else if(currentBlock.class == "if-then-else") {
			
			deactivateUnselected(currentBlock.then, selectedBlock);
			
			angular.forEach(currentBlock.then.sequence, function (block){
				
				deactivateUnselected(block,selectedBlock);
				
			});
			
			deactivateUnselected(currentBlock.else, selectedBlock);
			
			angular.forEach(currentBlock.else.sequence, function (block) {
				
				deactivateUnselected(block,selectedBlock);
				
			});
			
			angular.forEach(currentBlock.conditions, function (block) {
				
				deactivateUnselected(block,selectedBlock);
				
			});
			
		}
		else if(currentBlock.class == "while-do") {
			
			deactivateUnselected(currentBlock.do, selectedBlock);
			
			angular.forEach(currentBlock.do.sequence, function (block){
				
				deactivateUnselected(block,selectedBlock);
				
			});
			
			angular.forEach(currentBlock.conditions, function (block) {
				
				deactivateUnselected(block,selectedBlock);
				
			});
			
		}
		else if(currentBlock.class == "repeat") {
			
			deactivateUnselected(currentBlock.do, selectedBlock);
			
			angular.forEach(currentBlock.do.sequence, function (block){
				
				deactivateUnselected(block,selectedBlock);
				
			});
			
		}

	}

	$scope.addCondition = function (block) {
				
		condition = {}
		condition.class = "condition";
		condition.not = false;
		condition.comparator = null;
		condition.logicOperator = true;
		condition.value = null;
		condition.selected = false;
		condition.backgroundColor = $scope.blockUnselectedBackgroundColor;
		
		condition.parameter = null;
		
		block.conditions.push(condition);
		
	}

	$scope.trigger = function (capability,topic,message,capabNameIndex){
		
		//capName = getNameFromURI($capabNameIndex);
		console.log("Sending action " + capability + " to the server");
		
		capabDiv = angular.element(document.getElementById("cap_"+capabNameIndex));
				
		//console.log(capabDiv.children());
		values = {};
		angular.forEach(capabDiv.children(),function(input) {
			
			inputElement = angular.element(input);
			
			if(inputElement[0].localName == "input") {
				
				//console.log(inputElement[0].value);
				values[inputElement[0].name] = inputElement[0].value;
				
			}
		});
		
		toSend = {};
		toSend["type"] = capability;
		toSend["topic"] = topic;
		toSend["message"] = message;
		toSend["parameters"] = values;
		
		console.log(toSend);
		
		$http({
			
			method: 'POST',
			url: "http://localhost:5000/trigger",
			//url: "http://137.108.122.193:5000/trigger",
			//url: "http://10.229.169.122:5000/trigger",
			data: {"capability": toSend}
			
		}).then(function successCallback(response) {
			
			console.log("Response "+ response.status);	
				
		}, function errorCallback(response) {
			
			console.log("Problems while contacting the KB server " + response.status);
			
		});
	}
	
	$scope.getNameFromURI = function (uri) {
		
		return uri.substring(uri.lastIndexOf("/")+1,uri.length);
		
	}
	
	function disableAllBut (classToEnable) {
		
		angular.forEach($scope.capabilities,function(messageCapability) {
			
			capabilities = messageCapability["capabs"];
		
			angular.forEach(capabilities,function(capability) {
				
				if(classToEnable == "capability") {
					
					enable(capability);
					
				}
				else {
					
					disable(capability);
				}
				
				angular.forEach(capability["params"],function(parameter) {
					
					if(classToEnable == "parameter") {

						enable(parameter);

					}
					else {
						
						disable(parameter);
						
					}
				});
			
			});
			
		});
		
		// checking also the blocks
		angular.forEach($scope.program.blockTypes, function(blockType) {
		
			if(classToEnable == "block") {
				
				enable(blockType);
				
			}
			else {
				
				disable(blockType);
				
			}
			
		});
	}
	
	function enable (item) {
		item.disabled = false;
		item.backgroundColor = $scope.enabledBackgroundColor;
	}
	
	function disable (item) {
		item.disabled = true;
		item.backgroundColor = $scope.disabledBackgroundColor;
	}
	
	function replaceSlashes(input) {
		
		return input.replace("/\\//g","-");
		
	}
	
	function initialiseBlockTypes(blockArray) {
		
		statement = {}
		statement.class = "statement";
		statement.disabled = false;
		
		ifThenElse = {}
		ifThenElse.class = "if-then-else";
		ifThenElse.disabled = false;
		
		whileDo = {}
		whileDo.class = "while-do";
		whileDo.disabled = false;
		
		repeat = {}
		repeat.class = "repeat";
		repeat.disabled = false;
		
		blockArray.push(statement);
		blockArray.push(ifThenElse);
		blockArray.push(whileDo);
		blockArray.push(repeat);
		
	}
	
	$scope.addCapability = function (capability) {
		
		$scope.selectedBlock.capability = capability;
		
	}
	
	$scope.addParameter = function (parameter,capability) {
		
		comparisonParameter = {}
		comparisonParameter.parameter = parameter;
		comparisonParameter.capability = capability;
		$scope.selectedBlock.parameter = comparisonParameter;
		
	}
	
	$scope.stopPropagation = function ($event) {
		
		$event.stopPropagation();
		
	}
}

