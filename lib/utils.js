var camelize = function (arr) {
    if(arr.length) {
        return arr.map(item => {
            return Object.keys(item).reduce((res, cur) => {
                var camel = camelCase(cur);
                res[camel] = item[cur];
                return res;
            }, {})
        })
    }
}
var camelCase = function (str) {
    return str.toLowerCase().replace(/[_.-](\w|$)/g, function (_, x) {
        return x.toUpperCase();
    });
}
module.exports = {
    camelCase,
    camelize
}