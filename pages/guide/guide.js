Page({
  data: {},
  goDetail(e) {
    const model = e.currentTarget.dataset.model;
    wx.navigateTo({ url: '/pages/guide/detail/detail?model=' + model });
  }
});
