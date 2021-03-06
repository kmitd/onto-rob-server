import rospkg
import genmsg
from catkin.find_in_workspaces import find_in_workspaces
import os
import re


class RosMessage(object):
    _primitive_types = ["bool","int8","uint8","int16","uint16","int32","uint32","int64","uint64","float32","float64","string","time","duration","byte","char"]
    _search_path = {}
    _context = None

    _catkin_workspace_to_source_spaces = {}
    _catkin_source_path_to_packages = {}

    def get_package_paths(self,pkgname, rospack):
        paths = []
        path = rospack.get_path(pkgname)
        paths.append(path)
        results = find_in_workspaces(search_dirs=['share'], project=pkgname, first_match_only=True, workspace_to_source_spaces=RosMessage._catkin_workspace_to_source_spaces, source_path_to_packages=RosMessage._catkin_source_path_to_packages)

        if results and results[0] != path:
            paths.append(results[0])
        return paths

    def __init__(self, msg_type, used_by_topic, msg_name = None, is_array = False):
        self.msg_type = msg_type

        if not msg_name:
            self.msg_name = used_by_topic
        else:
            self.msg_name = msg_name

        if self.msg_type in RosMessage._primitive_types:        
            self.is_primitive = True
        else:
            self.is_primitive = False
        
        self.used_by_topic = used_by_topic
        self.fields = {}
        self.is_array = is_array        

        if  len(RosMessage._search_path) == 0:
            rospack = rospkg.RosPack()

            for p in rospack.list():
                    package_paths = self.get_package_paths(p, rospack)
                    RosMessage._search_path[p] = [os.path.join(d, 'msg') for d in package_paths]

        if not RosMessage._context:    
            RosMessage._context = genmsg.MsgContext.create_default()
    
        if not self.is_primitive:
            spec = genmsg.load_msg_by_type(RosMessage._context, self.msg_type, RosMessage._search_path)
        
            msgs_fields = spec.__dict__

            names = msgs_fields["names"]
            types = msgs_fields["types"]

            for i in range(0,len(names)):
                msg_field_name = names[i]
                msg_field_type = types[i]
                array = False
                
                pattern = r'\[[0-9]*\]'
                array_parts = re.findall(pattern, msg_field_type)

                if len(array_parts) > 0:
                    for array_part in array_parts:
                        msg_field_type = msg_field_type.replace(array_part,"")
                    array = True
                
                try:
                    msg_field = RosMessage(msg_field_type, self.used_by_topic, msg_field_name, is_array=array)
                    self.fields[msg_field_name] = msg_field
                except genmsg.msg_loader.MsgNotFound as e:
                    print "Message %s not found" % msg_field_type
                    pass
                    
    def get_complete_type(self):
        if self.is_array:
            return "%s[]" % self.msg_type
        else:
            return self.msg_type

    def get_all_children_msgs(self):
        all_children = []
        
        for msg_name in self.fields.keys():
            cur_child = self.fields[msg_name]
            all_children.append(cur_child)
            children_of_child = cur_child.get_all_children_msgs()
            
            for child_of_child in children_of_child:
                all_children.append(child_of_child)

        return all_children
