from flask import Flask, make_response, request, current_app, jsonify
import json
from rdflib import URIRef, Graph, RDF, Namespace
import codecs


from datetime import timedelta
from functools import update_wrapper

import rospy
import rosnode
from RosNode import RosNode
import importlib
import functools


def crossdomain(origin=None, methods=None, headers=None, max_age=21600, attach_to_all=True, automatic_options=True):
    """Decorator function that allows crossdomain requests.
     Courtesy of
     https://blog.skyred.fi/articles/better-crossdomain-snippet-for-flask.html
   """
    if methods is not None:
        methods = ', '.join(sorted(x.upper() for x in methods))
    if headers is not None and not isinstance(headers, basestring):
        headers = ', '.join(x.upper() for x in headers)
    if not isinstance(origin, basestring):
        origin = ', '.join(origin)
    if isinstance(max_age, timedelta):
        max_age = max_age.total_seconds()

    def get_methods():
        """ Determines which methods are allowed
       """
        if methods is not None:
            return methods

        options_resp = current_app.make_default_options_response()
        return options_resp.headers['allow']

    def decorator(f):
        """The decorator function
       """

        def wrapped_function(*args, **kwargs):
            """Caries out the actual cross domain code
           """
            if automatic_options and request.method == 'OPTIONS':
                resp = current_app.make_default_options_response()
            else:
                resp = make_response(f(*args, **kwargs))
            if not attach_to_all and request.method != 'OPTIONS':
                return resp

            h = resp.headers
            h['Access-Control-Allow-Origin'] = origin
            h['Access-Control-Allow-Methods'] = get_methods()
            h['Access-Control-Max-Age'] = str(max_age)
            h['Access-Control-Allow-Credentials'] = 'true'
            h['Access-Control-Allow-Headers'] = \
                "Origin, X-Requested-With, Content-Type, Accept, Authorization"
            if headers is not None:
                h['Access-Control-Allow-Headers'] = headers
            return resp

        f.provide_automatic_options = False
        return update_wrapper(wrapped_function, f)

    return decorator


class OntoRobServer:
    __GRAPHFILE = '../out.n3'
    __ONTOROB_RES = Namespace("http://data.open.ac.uk/kmi/ontoRob/resource/")
    __ONTOROB_CLASS = Namespace("http://data.open.ac.uk/kmi/ontoRob#")
    __ONTOROB_PROP = Namespace("http://data.open.ac.uk/kmi/ontoRob/property/")
    
    def __init__(self): 
        self.readKB()

    def setKBfile(self, inputFile):
        """
        load a different file if needed
        """
        self.__GRAPHFILE = inputFile
        self.readKB()
        
    def readKB(self):
         self.__G = Graph()
         self.__G.parse(self.__GRAPHFILE, format="n3")
         
    def getGraph(self):
        return self.__G
        
    def addTopics(self, data):
        for node in data:
            topic = URIRef(self.__ONTOROB_RES.topic + "/" + node['topic'][1:])
            self.__G.add((URIRef(self.__ONTOROB_RES+node['message']), URIRef(self.__ONTOROB_PROP.publishedOn), topic))
            self.__G.add((topic, RDF.type, URIRef(self.__ONTOROB_CLASS.Topic)))
    

    def query_KB(self,jsonString):
        """
        TODO change name of method. 
        """
        response_array = list()
        # print jsonString
        
        for item in jsonString : 
            # print "fff", item['message']
            component_obj= { 'node_name' : item['node'], 'msg': item['message'], 'capabs' : []  }
            
            query_string=self.build_query([item['message']]) # TODO : ONE per array?
            
            # print query_string
            
            qres = self.__G.query(query_string)
            for row in qres:
                # print row
                
                if len(component_obj['capabs']) == 0 or row.capa not in list(c['type'] for c in component_obj['capabs']):
                    component_obj['capabs'].append( {'type' : row.capa, 'params' : []} )
                
                ix = 0
                for c in component_obj['capabs']:
                    if c['type'] == row.capa: 
                        ix = component_obj['capabs'].index(c)
                component_obj['capabs'][ix]['params'].append({"p" : row.param, "mode" : "write"})
                
                
            response_array.append(component_obj)
              
        return response_array
        
    def build_query(self,msg_list):
        """
        select capabilities given a set of topics
        """
        values="VALUES(?res) {"
        for msg in msg_list:
            values += "( <"+self.__ONTOROB_RES + msg + ">) "
        values+="}"
    
        query = "SELECT ?capa ?param WHERE { " + values + " ?res <"+self.__ONTOROB_PROP.evokes+"> ?capa . ?res <"+self.__ONTOROB_PROP.hasField +"> ?param . ?capa <"+self.__ONTOROB_PROP.hasParameter +"> ?param . }";
        return query


    def getPackage(self,msg):
        query = "SELECT ?pkg WHERE { <"+msg+"> <"+self.__ONTOROB_PROP.hasPkg+"> ?pkg . }"
        
        # print 2,query
        qres = self.__G.query(query)
        
        ix = 0
        pkg=""
        res = ""
        for row in qres:
            # print row
            if ix > 1: break
            res=row.pkg
            ix+=1   
        return res 
    
    def getMessageName(self,capability, parameters):
        triples=""
        for param in parameters:
            triples+= "?msg <"+self.__ONTOROB_PROP.hasField+"> <"+self.__ONTOROB_RES.field+"/"+param+">. "
        query = "SELECT ?msg WHERE { ?msg <"+self.__ONTOROB_PROP.evokes+"> <"+capability+"> . "+ triples + " }"
        
        # print 1,query
        qres = self.__G.query(query)
        
        ix = 0
        res = ""
        for row in qres:
            if ix > 1: break
            res=row.msg
            ix+=1
             
        return res
        
    def getTopicFromMsg(self,msg):
        query = "SELECT ?topic WHERE { <"+msg+"> <"+self.__ONTOROB_PROP.publishedOn+"> ?topic .  }"
        # print query
        qres = self.__G.query(query)
        
        ix = 0
        topic = ""
        for row in qres:
            if ix > 1: break
            topic=row.topic
            ix+=1
        return topic       
    
    def saveGraph(self):
        s = self.__G.serialize(format='turtle')
        fw = codecs.open("../temp_graph.n3",'w')
        fw.write(s)
        fw.close()
        return
        
app = Flask(__name__)
onto_server = OntoRobServer()

@app.route("/")
def index():
    return "OntoRobServer ready for listening"

@app.route("/msg/<msg>")
def ask_nodes(msg):
    """
    queries the KB : which capabilities are evoked by this node?
    """
    result = ""
    g = onto_server.getGraph()
    qres = g.query(
        """SELECT DISTINCT ?b
           WHERE {
               <http://data.open.ac.uk/kmi/ontoRob/resource/%s> <http://data.open.ac.uk/kmi/ontoRob/property/evokes> ?b.
           } """ % msg)
    
    for row in qres:
        result+="%s <br/>" % row
    return result,200


@app.route("/capability_temp", methods=['GET', 'OPTIONS'])
@crossdomain(origin='*')
def ask_temp_capa():
    g = onto_server.getGraph()
    qres = g.query(
        """SELECT DISTINCT ?b
           WHERE {
               <http://data.open.ac.uk/kmi/ontoRob/resource/geometry_msgs/PoseStamped> <http://data.open.ac.uk/kmi/ontoRob/property/evokes> <http://data.open.ac.uk/kmi/ontoRob/resource/capability/Navigation_Movement>.
                <http://data.open.ac.uk/kmi/ontoRob/resource/capability/Navigation_Movement> <http://data.open.ac.uk/kmi/ontoRob/property/hasParameter> ?b .
                <http://data.open.ac.uk/kmi/ontoRob/resource/geometry_msgs/PoseStamped> <http://data.open.ac.uk/kmi/ontoRob/property/hasField> ?b.
           } """
    )  
    result = dict()
    result['node_name'] = "/move_base"
    result['msg'] = "/geometry_msgs/PoseStamped"
    result['capabs'] = list()
    result['capabs'].append({'params' : list(), 'type': 'http://data.open.ac.uk/kmi/ontoRob/resource/capability/Navigation_Movement'})
    for row in qres:
        # print row
        result['capabs'][0]['params'].append({'p': row[0], 'mode': 'write'})
    return json.dumps([result]), 200


@app.route("/capability/<capa>", methods=['GET', 'OPTIONS'])
@crossdomain(origin='*')
def ask_capability(capa):
    """
    queries the KB : which nodes evoke such capability?
    """
    result = ""
    g = onto_server.getGraph()
    qres = g.query(
        """SELECT DISTINCT ?b
           WHERE {
              ?b <http://data.open.ac.uk/kmi/ontoRob/property/evokes> <http://data.open.ac.uk/kmi/ontoRob/resource/%s>.
           } """ % capa)

    for row in qres:
        result += "%s <br/>" % row
    return jsonify(result), 200


@app.route('/capabilities', methods=['GET', 'OPTIONS'])
@crossdomain(origin='*')
def ask_capabilities():
    
    parsed_json = get_nodes()

    # add topics dynamically
    onto_server.addTopics(parsed_json)
    
    onto_server.saveGraph()
    
    # get capabilitites
    response_array = onto_server.query_KB(parsed_json)

    return json.dumps(response_array)

@app.route('/trigger',methods=['GET','POST','OPTIONS'])
@crossdomain(origin='*')
def triggerCapability():
    """
    in : capability + params
    out : (json) msg + topic + params
    """
    if request.method == 'POST':
        response = json.loads(request.data)['capability']
    elif request.method == 'GET':
        response = json.loads(str(request.args['capability']))
    else :
        return "Method not allowed", 403

    robot_input = dict()
    
    # add parameters to robotinput
    robot_input['param_values']=response['parameters']
    fields = list( param for param in robot_input['param_values'].keys())
    robot_input['fields']=fields
    
    # get message name from capability+parameters
    msg = onto_server.getMessageName(response['type'],response['parameters'])
    robot_input['name']=msg.split("/")[-1]
    
    # get pkg
    pkg = onto_server.getPackage(msg)
    robot_input['pkg']=pkg.split("/")[-1]
    
    # get topic from Msg
    topic = onto_server.getTopicFromMsg(msg)
    robot_input['topic'] = topic

    send_command(robot_input)
     
    return jsonify(robot_input), 200


def rsetattr(obj, attr, val):
    pre, _, post = attr.rpartition('.')
    try:
        v = float(val)
    except ValueError:
        v = val
    return setattr(functools.reduce(getattr, [obj]+pre.split('.')) if pre else obj, post, v)


def gen_message(jp, attr):
    fields = jp['fields']
    tmsg = attr()
    for f in fields:
        rsetattr(tmsg, f, jp['param_values'][f])
    return tmsg


def activate_publisher(jp):
    attr = getattr(importlib.import_module(jp['pkg'] + '.msg'), jp['name'])
    pub = rospy.Publisher(jp['topic'], attr, queue_size=1)
    return pub, attr


def send_command(input_d):
    rospy.init_node('talker', disable_signals=True)
    pub, attr = activate_publisher(input_d)
    msg = gen_message(input_d, attr)
    rate = rospy.Rate(1)
    while not rospy.is_shutdown():
        if pub.get_num_connections() > 0:
            pub.publish(msg)
            break
        rate.sleep()


def get_nodes():
    nodelist = rosnode.get_node_names()
    capabilities = []
    for nodename in nodelist:
        # initialise RosNode object
        node = RosNode(nodename)
        capabilities.extend(node.get_capability_msg())

    return capabilities
    # TODO : include ROStalker
    # return json.loads('[ { "node":"/stageros", "topic":"/odom", "message":"nav_msgs/Odometry", "method":"msg" }, { "node":"/stageros", "topic":"/scan", "message":"sensor_msgs/LaserScan", "method":"msg" }, { "node":"/move_base", "topic":"/move_base/goal", "message":"move_base_msgs/MoveBaseActionGoal", "method":"msg" } ]')


if __name__ == "__main__":
  
    print "Starting server"
    app.run(debug=True, use_reloader=True, host='0.0.0.0')
