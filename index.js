var fs = require('fs');
var HTML = require('html-parse-stringify2');
var convert = require('./lib/convert');
var utils = require('./lib/utils');
var knex = require('knex');
var inquirer = require('inquirer');
var Velocity = require('velocityjs');

var myBatisMapper = {};
const xmlTemplate = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper
PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
"http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="\${ClassName}Mapper">
    


    <sql id="select\${ClassName}Vo">
        select#foreach($column in $columns) $column.columnName#if($velocityCount != $columns.size()),#end#end from \${tableName}
    </sql>

    <select id="select\${ClassName}List">
        <include refid="select\${ClassName}Vo"/>
        <where>  
#foreach($column in $columns)
#set($javaField=$column.javaField)
#set($columnName=$column.columnName)
#set($AttrName=$column.javaField.substring(0,1).toUpperCase() + \${column.javaField.substring(1)})

<if test="$javaField != null and $javaField != ''"> and $columnName = #{$javaField}</if>
<!-- 模糊查询请打开注释 -->
<!--  <if test="$javaField != null and $javaField != ''"> and $columnName like concat('%', #{$javaField}, '%')</if> -->
<!-- 范围查询请打开注释 -->
<!-- <if test="params.begin$AttrName != null and params.begin$AttrName != '' and params.end$AttrName != null and params.end$AttrName != ''"> and $columnName between #{params.begin$AttrName} and #{params.end$AttrName}</if> -->

#end
        </where>
    </select>
    
    <select id="select\${ClassName}ById" >
        <include refid="select\${ClassName}Vo"/>
        WHERE \${pkColumn.columnName} = #{\${pkColumn.javaField}}
    </select>
        
    <insert id="insert\${ClassName}" #if($pkColumn.increment) useGeneratedKeys="true" keyProperty="$pkColumn.javaField"#end>
    INSERT INTO \${tableName}
        <trim prefix="(" suffix=")" suffixOverrides=",">
#foreach($column in $columns)
#if($column.columnName != $pkColumn.columnName || !$pkColumn.increment)
            <if test="$column.javaField != null#if($column.required) and $column.javaField != ''#end">$column.columnName,</if>
#end
#end
         </trim>
        <trim prefix="values (" suffix=")" suffixOverrides=",">
#foreach($column in $columns)
#if($column.columnName != $pkColumn.columnName || !$pkColumn.increment)
            <if test="$column.javaField != null#if($column.required) and $column.javaField != ''#end">#{$column.javaField},</if>
#end
#end
         </trim>
    </insert>

    <update id="update\${ClassName}">
        UPDATE \${tableName}
        <trim prefix="SET" suffixOverrides=",">
#foreach($column in $columns)
#if($column.columnName != $pkColumn.columnName)
            <if test="$column.javaField != null#if($column.required) and $column.javaField != ''#end">$column.columnName = #{$column.javaField},</if>
#end
#end
        </trim>
        WHERE \${pkColumn.columnName} = #{\${pkColumn.javaField}}
    </update>

    <delete id="delete\${ClassName}ById" >
        DELETE FROM \${tableName} WHERE \${pkColumn.columnName} = #{\${pkColumn.javaField}}
    </delete>

    <delete id="delete\${ClassName}ByIds" >
        DELETE FROM \${tableName} WHERE \${pkColumn.columnName} in 
        <foreach item="\${pkColumn.javaField}" collection="array" open="(" separator="," close=")">
            #{\${pkColumn.javaField}}
        </foreach>
    </delete>
    
</mapper>`


function MybatisMapper() {

}


MybatisMapper.prototype.initFromDirs = function (dirs) {
  dirs.forEach(dir => {
    var files = fs.readdirSync(dir);
    this.initFromFiles(files, dir);
  })
}

MybatisMapper.prototype.initFromFiles = function (files, basePath) {
  const queryTypes = ['sql', 'select', 'insert', 'update', 'delete'];
  // Parse each XML files
  for (var i = 0, xml; xml = files[i]; i++) {
    try {
      var rawText = replaceCdata(fs.readFileSync(basePath ? basePath + (basePath.endsWith('/') ? '' : '/') + xml : xml).toString());
      var mappers = HTML.parse(rawText);
    } catch (err) {
      throw new Error("failed to read XML file [" + xml + "]");
    }

    try {
      for (var j = 0, mapper; mapper = mappers[j]; j++) {
        // Mapping <mapper> tag recursively
        findMapper(mapper);
      }
    } catch (err) {
      throw new Error("Error occured during parse XML file [" + xml + "]");
    }
  }
};

findMapper = function (children) {
  var queryTypes = ['sql', 'select', 'insert', 'update', 'delete'];

  if (children.type == 'tag' && children.name == 'mapper') {
    // Add Mapper
    myBatisMapper[children.attrs.namespace] = {};

    for (var j = 0, sql; sql = children.children[j]; j++) {
      if (sql['type'] == 'tag' && queryTypes.indexOf(sql['name']) > -1) {
        myBatisMapper[children.attrs.namespace][sql.attrs.id] = sql.children;
      }
    }
    return;
  } else {
    // Recursive to next children
    if (children['children'] != null && children['children'].length > 0) {
      for (var j = 0, nextChildren; nextChildren = children.children[j]; j++) {
        findMapper(nextChildren);
      }
    } else {
      return;
    }
  }
}

replaceCdata = function (rawText) {
  var cdataRegex = new RegExp('(<!\\[CDATA\\[)([\\s\\S]*?)(\\]\\]>)', 'g');
  var matches = rawText.match(cdataRegex);

  if (matches != null && matches.length > 0) {
    for (var z = 0; z < matches.length; z++) {
      var regex = new RegExp('(<!\\[CDATA\\[)([\\s\\S]*?)(\\]\\]>)', 'g');
      var m = regex.exec(matches[z]);

      var cdataText = m[2];
      cdataText = cdataText.replace(/\&/g, '&amp;');
      cdataText = cdataText.replace(/\</g, '&lt;');
      cdataText = cdataText.replace(/\>/g, '&gt;');
      cdataText = cdataText.replace(/\"/g, '&quot;');

      rawText = rawText.replace(m[0], cdataText);
    }
  }

  return rawText;
}

MybatisMapper.prototype.buildSQL = function (namespace, sql, param) {
  var statement = '';

  // 入参检查
  if (!namespace) throw new Error('namespace can not be null!');
  if (myBatisMapper[namespace] == undefined) throw new Error('namespace [' + namespace + '] does not exist!');
  if (!sql) throw new Error('SQL ID can not be null!');
  if (myBatisMapper[namespace][sql] == undefined) throw new Error('SQL ID [' + sql + '] does not exist!');

  try {
    for (var i = 0, children; children = myBatisMapper[namespace][sql][i]; i++) {
      // 递归转换SQL语句
      statement += convert.convertChildren(children, param, namespace, myBatisMapper);
    }
    if (this.dbInfo.showSQL) {
      console.log(statement);
    }
    // 检查没有被成功替换的参数
    var regexList = ['\\#{\\S*}', '\\${\\S*}'];
    for (var i = 0, regexString; regexString = regexList[i]; i++) {
      var regex = new RegExp(regex, 'g');
      var checkParam = statement.match(regexString);

      if (checkParam != null && checkParam.length > 0) {
        throw new Error("Param " + checkParam.join(",") + " can not be replaced successfully.");
      }
    }
    return statement
  } catch (err) {
    throw err
  }
}
MybatisMapper.prototype.startTrx = async function() {
  if (!this.db) {
    this.db = knex(this.dbInfo);
  }
  return await this.db.transaction()
}
MybatisMapper.prototype.execute = async function (namespace, sqlID, param, trx) {
  if (!this.db) {
    this.db = knex(this.dbInfo);
  }
  const sql = this.buildSQL(namespace, sqlID, param)
  let resp = null
  if(trx) {
    resp = await this.db.raw(sql).transacting(trx)
  } else {
    resp = await this.db.raw(sql)
  }
  return utils.camelize(resp[0]);
};
MybatisMapper.prototype.executeInTrxConcurrent = async function (arr) {
  if (!this.db) {
    this.db = knex(this.dbInfo);
  }
  const sqlList = arr.map(sql => this.db.raw(this.buildSQL(sql[0], sql[1], sql[2])).transacting(trx))
  let trx = null
  try {
    trx = await this.db.transaction()
    await Promise.all(sqlList) 
    
    trx.commit()
  } catch (error) {
    if(trx) {
      await trx.rollback()
      throw new Error('Transaction has been rollbacked due to execution failure')
    }
    throw new Error('failed to start a transaction')
  }

}
MybatisMapper.prototype.executeInTrxSequential = async function (arr) {
  if (!this.db) {
    this.db = knex(this.dbInfo);
  }
  const sqlList = arr.map(sql => this.buildSQL(sql[0], sql[1], sql[2]))
  let trx = null
  try {
    trx = await this.db.transaction()
    for (let i = 0; i < sqlList.length; i++) {
      await this.db.raw(sqlList[i]).transacting(trx)
    }
    trx.commit()
  } catch (error) {
    if(trx) {
      await trx.rollback()
      throw new Error('Transaction has been rollbacked due to execution failure')
    }
    throw new Error('failed to start a transaction')
  }

}

MybatisMapper.prototype.getMapper = function () {
  return myBatisMapper;
};

MybatisMapper.prototype.genXML = async function () {
  const tables = await this.execute('GenTableMapper', 'selectDbTableList')
  console.log('<<<', tables, '>>>');
  const answers = await inquirer
    .prompt([
      { type: 'input', name: 'tableName', message: 'Please enter the table name you want to generate: ' }
    ])
  const tableName = answers.tableName
  const table = tables.find(item => {
    return item.tableName === tableName
  })
  console.log('<<<the table you selected is :', table, '>>>');

  const columns = await this.execute('GenTableColumnMapper', 'selectDbTableColumnsByName', { tableName: tableName })
  let pkColumn = columns[0];
  for (const column of columns) {
    column.javaField = utils.camelCase(column.columnName)
    column.required = (column.isRequired === '1')
    if (column.isPk === '1') {
      pkColumn = column
    }
  }
  pkColumn.increment = (pkColumn.isIncrement === '1')
  const renderResult = Velocity.render(xmlTemplate, { pkColumn, tableName: table.tableName, columns, ClassName: utils.camelCase(table.tableName).slice(0, 1).toUpperCase() + utils.camelCase(table.tableName).slice(1) });
  fs.writeFileSync(`${utils.camelCase(table.tableName).slice(0, 1).toUpperCase() + utils.camelCase(table.tableName).slice(1)}Mapper.xml`, renderResult);
  console.log('GENERATE SUCCESS');
};

module.exports = function (dbInfo) {
  const mapper = new MybatisMapper()
  mapper.dbInfo = dbInfo
  mapper.initFromDirs(['./builtin_xmls']);
  return mapper
};